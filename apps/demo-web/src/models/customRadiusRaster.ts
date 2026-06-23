import {
  createStubExecutor,
  registerModel,
  type ComputeProvider,
  type DrawnFeature,
  type MapLayerEnvelope,
  type ModelDef,
  type ResultLayerEntry,
  type SimulationEngine,
} from '@gsbio/core';

export const customRadiusRasterModel: ModelDef = {
  id: 'custom-radius-raster',
  name: 'Custom Radius Raster',
  description:
    'Stub pipeline — filters drawn Custom_radius circles, then submits each as a ' +
    'low-resolution distance-shaded image raster. One result layer per circle, ' +
    'toggleable independently under its source circle in the Results panel.',
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

interface CircleInput {
  id: string;
  center: { lng: number; lat: number };
  radiusMeters: number;
}

function selectCircles(features: ReadonlyArray<DrawnFeature>): CircleInput[] {
  const out: CircleInput[] = [];
  for (const f of features) {
    if (f.category === 'Custom_radius' && f.geometryKind === 'circle' && f.circle) {
      out.push({
        id: f.id,
        center: f.circle.center,
        radiusMeters: f.circle.radiusMeters,
      });
    }
  }
  return out;
}

interface CustomRadiusPayload {
  circles: CircleInput[];
  resolution: number;
}

const stubExecutor = createStubExecutor({
  latencyMs: 300,
  steps: 6,
  stepDelayMs: 80,
});

function rasterizeCircles(payload: CustomRadiusPayload): {
  layers: ResultLayerEntry[];
  summary: { count: number; circleIds: string[] };
} {
  const { circles, resolution } = payload;
  const layers: ResultLayerEntry[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { layers, summary: { count: 0, circleIds: [] } };
  for (const c of circles) {
    layers.push({ id: c.id, envelope: rasterForCircle(ctx, c, resolution) });
  }
  return {
    layers,
    summary: { count: layers.length, circleIds: circles.map((c) => c.id) },
  };
}

function rasterForCircle(
  ctx: CanvasRenderingContext2D,
  c: CircleInput,
  N: number,
): MapLayerEnvelope {
  const img = ctx.createImageData(N, N);
  const cx = (N - 1) / 2;
  const cy = (N - 1) / 2;
  const rNorm = N / 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Normalised distance from centre: 0 (centre) → 1 (circle edge).
      const d = Math.hypot(x - cx, y - cy) / rNorm;
      const i = (y * N + x) * 4;
      if (d >= 1) {
        // Outside the circle — fully transparent; the raster is masked to it.
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
  // Equirectangular approximation of the circle's bbox in lng/lat — the
  // renderer georeferences the image by these bounds (`image` envelope).
  const dLat = c.radiusMeters / 111_320;
  const dLng = c.radiusMeters / (111_320 * Math.cos((c.center.lat * Math.PI) / 180));
  const bounds: [number, number, number, number] = [
    c.center.lng - dLng,
    c.center.lat - dLat,
    c.center.lng + dLng,
    c.center.lat + dLat,
  ];
  return { kind: 'image', url, bounds };
}

export const customRadiusRasterProvider: ComputeProvider = {
  async preprocess(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const circles = selectCircles(ctx.features);
    const warnings: string[] = [];
    if (circles.length === 0) {
      warnings.push(
        'No Custom_radius circles drawn — submit will produce zero result layers.',
      );
    }
    const resolution =
      ctx.params.resolution ?? customRadiusRasterModel.params[0]!.default;
    return { payload: { circles, resolution }, warnings };
  },

  async submit(ctx, signal) {
    const payload = ctx.payload as CustomRadiusPayload;
    return stubExecutor.run(
      { payload, onProgress: ctx.onProgress, signal },
      rasterizeCircles,
    );
  },
};

export function installCustomRadiusRaster(engine: SimulationEngine): void {
  registerModel(customRadiusRasterModel);
  engine.registerComputeProvider(
    customRadiusRasterModel.id,
    customRadiusRasterProvider,
  );
  engine.dispatchModel({ type: 'SET_MODEL', payload: customRadiusRasterModel.id });
}