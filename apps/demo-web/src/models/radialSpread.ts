import {
  type DrawnFeature,
  type Executor,
  type MapLayerEnvelope,
  type ModelDef,
  type ResultLayerEntry,
  type SimulationEngine,
} from '@gsbio/core';

/**
 * Radial Spread — a trivial biological mock model.
 *
 * Frames the distance-shaded raster as biological radial spread from a drawn
 * source: each drawn "Spread zone" circle becomes one image raster whose
 * intensity falls off with distance from the centre, as if modelling the
 * expected density of a population diffusing outward from a release point.
 * Purely illustrative — the "biology" is a warm colour ramp, not real math.
 */
export const radialSpreadModel: ModelDef = {
  id: 'radial-spread',
  name: 'Radial Spread',
  description:
    'Trivial biological mock — each drawn Spread_zone circle is rasterised ' +
    'into a distance-shaded image whose intensity falls off from the centre, ' +
    'as a stand-in for radial population spread from a source point.',
  params: [
    {
      key: 'resolution',
      label: 'Raster resolution (px)',
      type: 'range',
      min: 16,
      max: 128,
      step: 8,
      default: 64,
    },
  ],
};

interface SourceZone {
  id: string;
  center: { lng: number; lat: number };
  radiusMeters: number;
}

function selectSpreadZones(features: ReadonlyArray<DrawnFeature>): SourceZone[] {
  const out: SourceZone[] = [];
  for (const f of features) {
    if (f.category === 'Spread_zone' && f.geometryKind === 'circle' && f.circle) {
      out.push({
        id: f.id,
        center: f.circle.center,
        radiusMeters: f.circle.radiusMeters,
      });
    }
  }
  return out;
}

interface RadialSpreadPayload {
  zones: SourceZone[];
  resolution: number;
}

const SUBMIT_STEPS = 6;
const SUBMIT_STEP_MS = 80;

/** Wait `ms`, rejecting with `AbortError` if `signal` fires first. */
function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      },
      { once: true },
    );
  });
}

function rasterizeZones(payload: RadialSpreadPayload): {
  layers: ResultLayerEntry[];
  summary: { count: number; zoneIds: string[] };
} {
  const { zones, resolution } = payload;
  const layers: ResultLayerEntry[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { layers, summary: { count: 0, zoneIds: [] } };
  for (const z of zones) {
    layers.push({ id: z.id, envelope: rasterForZone(ctx, z, resolution) });
  }
  return {
    layers,
    summary: { count: layers.length, zoneIds: zones.map((z) => z.id) },
  };
}

function rasterForZone(
  ctx: CanvasRenderingContext2D,
  z: SourceZone,
  N: number,
): MapLayerEnvelope {
  const img = ctx.createImageData(N, N);
  const cx = (N - 1) / 2;
  const cy = (N - 1) / 2;
  const rNorm = N / 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Normalised distance from centre: 0 (centre) → 1 (zone edge).
      const d = Math.hypot(x - cx, y - cy) / rNorm;
      const i = (y * N + x) * 4;
      if (d >= 1) {
        // Outside the zone — fully transparent; the raster is masked to it.
        img.data[i + 0] = 0;
        img.data[i + 1] = 0;
        img.data[i + 2] = 0;
        img.data[i + 3] = 0;
      } else {
        // Inside — warm intensity fading with distance from the centre.
        const t = 1 - d; // 1 centre → 0 edge
        img.data[i + 0] = 255;
        img.data[i + 1] = Math.round(180 * t + 40);
        img.data[i + 2] = Math.round(40 * t);
        // Quadratic alpha falloff so edges fade out smoothly.
        img.data[i + 3] = Math.round(255 * t * t);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = (ctx.canvas as HTMLCanvasElement).toDataURL('image/png');
  // Equirectangular approximation of the zone's bbox in lng/lat — the engine
  // georeferences the image on the map using these bounds.
  const dLat = z.radiusMeters / 111_320;
  const dLng = z.radiusMeters / (111_320 * Math.cos((z.center.lat * Math.PI) / 180));
  const bounds: [number, number, number, number] = [
    z.center.lng - dLng,
    z.center.lat - dLat,
    z.center.lng + dLng,
    z.center.lat + dLat,
  ];
  return { kind: 'image', url, bounds };
}

/**
 * Executor for the Radial Spread model — executes the computation for the
 * model (it is not part of the model). Bound to the model by id at install
 * time; a single `Executor` implementation could in principle serve other
 * models too.
 */
export const radialSpreadExecutor: Executor = {
  async preprocess(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const zones = selectSpreadZones(ctx.features);
    const warnings: string[] = [];
    if (zones.length === 0) {
      warnings.push('No Spread_zone circles drawn — submit will produce zero result layers.');
    }
    const resolution =
      ctx.params.resolution ?? radialSpreadModel.params[0]!.default;
    return { payload: { zones, resolution }, warnings };
  },

  async submit(ctx, signal) {
    const payload = ctx.payload as RadialSpreadPayload;
    // Simulated streaming compute: emit a progress tick per step. A real
    // executor would post payload to a worker/backend awaiting the result.
    for (let i = 1; i <= SUBMIT_STEPS; i++) {
      await delay(SUBMIT_STEP_MS, signal);
      ctx.onProgress?.({ step: 'submit', fraction: i / SUBMIT_STEPS, label: `step ${i}/${SUBMIT_STEPS}` });
    }
    return rasterizeZones(payload);
  },
};

/** One-call installer: register the model, bind its executor, select it. */
export function installRadialSpread(engine: SimulationEngine): void {
  engine.registerModel(radialSpreadModel);
  engine.registerExecutor(radialSpreadModel.id, radialSpreadExecutor);
  engine.dispatchModel({ type: 'SET_MODEL', payload: radialSpreadModel.id });
}