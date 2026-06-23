/**
 * Executor for the Radial Spread model — WebAssembly compute.
 *
 * Bound to the model by id at install time. `preprocess` filters the drawn
 * `Spread_zone` circles; `submit` invokes the wasm kernel once to fill the
 * radial ramp, then emits one `image` envelope per circle (the raster is a
 * centred distance field and identical for every circle, so it is rendered
 * once and reused — only each circle's geo `bounds` differ). A single honest
 * progress tick is emitted on completion; the kernel itself is a synchronous
 * main-thread call and cannot be interrupted mid-fill.
 */

import type {
  Executor,
  ResultLayerEntry,
  RunResult,
  SimulationEngine,
} from '@gsbio/core';
import { circleBounds, selectSpreadZones, type Zone } from '../shared';
import { radialSpreadModel } from './model';
import { renderRadialRaster } from './rasterize';

interface RadialSpreadPayload {
  zones: Zone[];
  resolution: number;
}

export const radialSpreadExecutor: Executor = {
  async preprocess(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const zones = selectSpreadZones(ctx.features);
    if (zones.length === 0) {
      ctx.onLog?.('warning', 'No Spread_zone circles drawn — submit will produce zero result layers.');
    }
    const resolution =
      ctx.params.resolution ?? radialSpreadModel.params[0]!.default;
    return { payload: { zones, resolution } };
  },

  async submit(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const { zones, resolution } = ctx.payload as RadialSpreadPayload;
    if (zones.length === 0) {
      return {
        layers: [] as ResultLayerEntry[],
        summary: { count: 0, zoneIds: [] as string[] },
      };
    }
    // The wasm kernel returns a PNG data URL of the centred radial ramp.
    const url = renderRadialRaster(resolution);
    const layers: ResultLayerEntry[] = zones.map((z) => ({
      id: z.id,
      envelope: { kind: 'image', url, bounds: circleBounds(z) },
    }));
    ctx.onProgress?.({ step: 'submit', fraction: 1, label: 'rasterised' });
    return {
      layers,
      summary: { count: layers.length, zoneIds: zones.map((z) => z.id) },
    } satisfies RunResult;
  },
};

/** One-call installer: register the model, bind its executor, select it. */
export function installRadialSpread(engine: SimulationEngine): void {
  engine.registerModel(radialSpreadModel);
  engine.registerExecutor(radialSpreadModel.id, radialSpreadExecutor);
  engine.dispatchModel({ type: 'SET_MODEL', payload: radialSpreadModel.id });
}