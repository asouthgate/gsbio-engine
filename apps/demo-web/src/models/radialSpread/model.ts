/**
 * Radial Spread — demo model (archetype C: pure main-thread compute).
 *
 * Each drawn "Spread_zone" circle is rasterised into a distance-shaded image
 * whose intensity falls off from the centre, as if modelling the expected
 * density of a population diffusing outward from a release point.
 *
 * The raw rasterisation math lives in `./rasterize.ts`. This file holds only
 * the engine contract glue (`ModelDef`, `Executor`, installer).
 */

import {
  type DrawnFeature,
  type Executor,
  type ModelDef,
  type SimulationEngine,
} from '@gsbio/core';
import { delay } from '../../shared/delay';
import { rasterizeZones, type SourceZone } from './rasterize';

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

interface RadialSpreadPayload {
  zones: SourceZone[];
  resolution: number;
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

const SUBMIT_STEPS = 6;
const SUBMIT_STEP_MS = 80;

/**
 * Executor for the Radial Spread model — pure main-thread compute.
 * Submit emits simulated progress ticks (a real executor with no async work
 * would skip these), then rasterises zones inline.
 */
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
    const payload = ctx.payload as RadialSpreadPayload;
    for (let i = 1; i <= SUBMIT_STEPS; i++) {
      await delay(SUBMIT_STEP_MS, signal);
      ctx.onProgress?.({
        step: 'submit',
        fraction: i / SUBMIT_STEPS,
        label: `step ${i}/${SUBMIT_STEPS}`,
      });
    }
    return rasterizeZones(payload.zones, payload.resolution);
  },
};

/** One-call installer: register the model, bind its executor, select it. */
export function installRadialSpread(engine: SimulationEngine): void {
  engine.registerModel(radialSpreadModel);
  engine.registerExecutor(radialSpreadModel.id, radialSpreadExecutor);
  engine.dispatchModel({ type: 'SET_MODEL', payload: radialSpreadModel.id });
}