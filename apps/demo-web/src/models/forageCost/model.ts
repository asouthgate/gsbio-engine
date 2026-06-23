/**
 * Forage Cost-of-Reach — demo model (archetype B: WASM compute).
 *
 * Frames a cost-distance raster: each drawn `Source` point is a feeding
 * station (cost 0); each `Barrier` polygon is a no-go obstacle (cost NaN /
 * impassable); everything else accumulates the cheapest 4-neighbour path
 * cost from any source. Cheap-to-reach cells are green, expensive cells
 * are red, barriers / unreachable cells are transparent.
 *
 * The relaxation kernel is compiled to WebAssembly in
 * `apps/demo-web/src/wasm/costmap.ts` (`costmap.wasm` ships committed). The
 * submit glue here instantiates the wasm module directly on the main
 * thread (compute is ms-scale); a worker would be the next escalation for
 * heavier models. A pure-TypeScript reference of the kernel lives in
 * `./diffusion.ts` so the math is readable without the AssemblyScript
 * toolchain.
 */

import type {
  DrawnFeature,
  Executor,
  MapLayerEnvelope,
  ModelDef,
  ResultLayerEntry,
  SimulationEngine,
} from '@gsbio/core';
import { costToImageData } from './colourmap';
import {
  setup as wasmSetup,
  markSource as wasmMarkSource,
  markBarrier as wasmMarkBarrier,
  relax as wasmRelax,
  dataStart as wasmDataStart,
  memory as wasmMemory,
} from '../../wasm/costmap.wasm';

export const forageCostModel: ModelDef = {
  id: 'forage-cost',
  name: 'Forage Cost-of-Reach',
  description:
    'Cost-distance raster from drawn Source points through drawn Barrier ' +
    'polygons. The WASM kernel iteratively relaxes a min-plus sweep across ' +
    'the grid; the resulting cost field is colour-mapped onto an image ' +
    'envelope (cheap = green, expensive = red, barrier = transparent).',
  params: [
    {
      key: 'resolution',
      label: 'Grid resolution (cells)',
      type: 'range',
      min: 16,
      max: 128,
      step: 8,
      default: 64,
    },
    {
      key: 'iters',
      label: 'Relaxation iterations',
      type: 'range',
      min: 10,
      max: 200,
      step: 10,
      default: 80,
    },
  ],
};

interface LngLat {
  lng: number;
  lat: number;
}

interface ForageCostPayload {
  sources: { id: string; lng: number; lat: number }[];
  barrierCells: LngLat[];
  bounds: { minLng: number; minLat: number; maxLng: number; maxLat: number };
  rows: number;
  cols: number;
  iters: number;
}

function collectInput(features: ReadonlyArray<DrawnFeature>) {
  const sources: { id: string; lng: number; lat: number }[] = [];
  const barrierCells: LngLat[] = [];
  for (const f of features) {
    if (f.category === 'Source' && f.geometryKind === 'point') {
      const g = f.geojson.geometry;
      if (g.type === 'Point' && g.coordinates) {
        const [lng, lat] = g.coordinates as [number, number];
        sources.push({ id: f.id, lng, lat });
      }
    } else if (f.category === 'Barrier' && f.geometryKind === 'polygon') {
      const g = f.geojson.geometry;
      if (g.type === 'Polygon' && g.coordinates) {
        for (const ring of g.coordinates as number[][][]) {
          for (const pt of ring) {
            if (pt.length >= 2) barrierCells.push({ lng: pt[0], lat: pt[1] });
          }
        }
      }
    }
  }
  return { sources, barrierCells };
}

function computeBounds(
  sources: LngLat[],
  barrierCells: LngLat[],
): { minLng: number; minLat: number; maxLng: number; maxLat: number } {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;
  for (const p of [...sources, ...barrierCells]) {
    if (p.lng < minLng) minLng = p.lng;
    if (p.lng > maxLng) maxLng = p.lng;
    if (p.lat < minLat) minLat = p.lat;
    if (p.lat > maxLat) maxLat = p.lat;
  }
  // Pad by 5% so sources don't sit on the very edge of the raster.
  const padLng = (maxLng - minLng) * 0.05 || 0.01;
  const padLat = (maxLat - minLat) * 0.05 || 0.01;
  return {
    minLng: minLng - padLng,
    minLat: minLat - padLat,
    maxLng: maxLng + padLng,
    maxLat: maxLat + padLat,
  };
}

export const forageCostExecutor: Executor = {
  async preprocess(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const { sources, barrierCells } = collectInput(ctx.features);
    if (sources.length === 0) {
      ctx.onLog?.('warning', 'No Source points drawn — cost raster will be uniformly expensive.');
    }
    if (sources.length === 0 && barrierCells.length === 0) {
      return {
        payload: {
          sources: [],
          barrierCells: [],
          bounds: { minLng: 0, minLat: 0, maxLng: 1, maxLat: 1 },
          rows: 16,
          cols: 16,
          iters: ctx.params.iters ?? forageCostModel.params[1]!.default,
        } satisfies ForageCostPayload,
      };
    }
    const bounds = computeBounds(sources, barrierCells);
    const resolution =
      ctx.params.resolution ?? forageCostModel.params[0]!.default;
    const latSpanMeters = (bounds.maxLat - bounds.minLat) * 111_320;
    const midLat = ((bounds.minLat + bounds.maxLat) / 2) * (Math.PI / 180);
    const lngSpanMeters =
      (bounds.maxLng - bounds.minLng) * 111_320 * Math.cos(midLat);
    const aspect = lngSpanMeters / latSpanMeters;
    let rows: number;
    let cols: number;
    if (aspect >= 1) {
      rows = resolution;
      cols = Math.max(8, Math.round(resolution * aspect));
    } else {
      cols = resolution;
      rows = Math.max(8, Math.round(resolution / aspect));
    }
    const iters = ctx.params.iters ?? forageCostModel.params[1]!.default;
    ctx.onLog?.('info', `Grid ${rows}\u00d7${cols}, ${iters} relaxation iterations.`);
    return {
      payload: { sources, barrierCells, bounds, rows, cols, iters } satisfies ForageCostPayload,
    };
  },

  async submit(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const p = ctx.payload as ForageCostPayload;
    const { bounds, rows, cols, iters } = p;
    if (p.sources.length === 0) {
      ctx.onLog?.('warning', 'No Source points — produced zero result layers.');
      return { layers: [] as ResultLayerEntry[], summary: { sourceCount: 0 } };
    }
    ctx.onLog?.('info', `Marking ${p.sources.length} source point${p.sources.length === 1 ? '' : 's'} and ${p.barrierCells.length} barrier cell${p.barrierCells.length === 1 ? '' : 's'}.`);
    wasmSetup(rows, cols);
    const lngSpan = bounds.maxLng - bounds.minLng || 1;
    const latSpan = bounds.maxLat - bounds.minLat || 1;
    for (const s of p.sources) {
      const c = Math.max(0, Math.min(cols - 1, Math.floor(((s.lng - bounds.minLng) / lngSpan) * cols)));
      const r = Math.max(0, Math.min(rows - 1, Math.floor(((bounds.maxLat - s.lat) / latSpan) * rows)));
      wasmMarkSource(r, c, cols);
    }
    for (const b of p.barrierCells) {
      const c = Math.max(0, Math.min(cols - 1, Math.floor(((b.lng - bounds.minLng) / lngSpan) * cols)));
      const r = Math.max(0, Math.min(rows - 1, Math.floor(((bounds.maxLat - b.lat) / latSpan) * rows)));
      wasmMarkBarrier(r, c, cols);
    }
    // Run relaxation in chunks so we can emit progress + check abort between
    // chunks. WASM itself is synchronous main-thread compute; abort inside a
    // single relax() call is not possible — workers are the next escalation
    // for heavier models.
    const CHUNKS = 8;
    const perChunk = Math.max(1, Math.ceil(iters / CHUNKS));
    let doneIters = 0;
    for (let i = 0; i < CHUNKS && doneIters < iters; i++) {
      wasmRelax(rows, cols, Math.min(perChunk, iters - doneIters));
      doneIters += perChunk;
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      ctx.onProgress?.({
        step: 'submit',
        fraction: doneIters / iters,
        label: `relaxation ${Math.min(i + 1, CHUNKS)}/${CHUNKS}`,
      });
    }
    const cost = new Float32Array(wasmMemory.buffer, wasmDataStart(), rows * cols);
    const imageData = costToImageData(cost, rows, cols);
    const canvas = document.createElement('canvas');
    canvas.width = cols;
    canvas.height = rows;
    const canvasCtx = canvas.getContext('2d');
    if (!canvasCtx) {
      return { layers: [] as ResultLayerEntry[], summary: { sourceCount: p.sources.length } };
    }
    canvasCtx.putImageData(imageData, 0, 0);
    const url = canvas.toDataURL('image/png');
    const envelope: MapLayerEnvelope = {
      kind: 'image',
      url,
      bounds: [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat],
    };
    return {
      layers: [{ id: 'forage-cost', envelope } as ResultLayerEntry],
      summary: { sourceCount: p.sources.length, barrierCellCount: p.barrierCells.length },
    };
  },
};

/** One-call installer: register the model, bind its executor. Does NOT
 *  auto-select (the user picks a model via the Model dropdown). */
export function installForageCost(engine: SimulationEngine): void {
  engine.registerModel(forageCostModel);
  engine.registerExecutor(forageCostModel.id, forageCostExecutor);
}