/**
 * Executor for the Radial Spread model with WebAssembly compute.
 *
 * An Executor must implement:
 *  - `preprocess(ctx: PreprocessContext, signal: AbortSignal)`
 *      which must return PreprocessResult or Promise<PreprocessResult>;
 *  - `submit`: must return Promise<RunResult>
 * 
 */

import type {
  Executor,
  PreprocessContext,
  PreprocessResult,
  ResultLayerEntry,
  RunResult,
  SimulationEngine,
  SubmitContext
} from '@gsbio/engine';
import { circleBounds, selectSpreadZones, type Zone } from '../shared';
import { radialSpreadModel } from './model';
import { renderRadialRaster } from './rasterize';

interface RadialSpreadPayload {
  zones: Zone[];
  resolution: number;
}

export const radialSpreadExecutor: Executor = {
  // Step 1: preprocess
  async preprocess(ctx: PreprocessContext, signal: AbortSignal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

    const zones = selectSpreadZones(ctx.features);
    if (zones.length === 0) {
      ctx.onLog?.('warning', 'No Spread_zone circles drawn: submit will produce zero result layers.');
    }

    const resolution = ctx.params.resolution ?? radialSpreadModel.params[0]!.default;
    return { 
      payload: { zones, resolution }
    } satisfies PreprocessResult;
  },
  // Step 2: submission handler
  async submit(ctx: SubmitContext, signal: AbortSignal) {
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
  engine.setModel(radialSpreadModel.id);
}