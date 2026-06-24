/**
 * Radial Spread — demo model (archetype A: WASM compute).
 *
 * Each drawn `Spread_zone` circle is rasterised by a compiled WebAssembly
 * kernel (`examples/demo-web/src/wasm/spread.ts`) into a distance-shaded warm
 * image whose intensity falls off from the centre, as a stand-in for radial
 * population spread from a source point. The WASM kernel fills the raster
 * once; the executor emits one `image` envelope per circle, each pinned to
 * that circle's geo `bounds` (only the bounds differ — the raster itself is
 * a centred distance field, identical for every circle).
 *
 * This file holds only the model schema (`ModelDef`); the executor that runs
 * the computation lives in `./executor.ts`. Shared circle-helpers
 * (`selectSpreadZones`, `circleBounds`) live in `../shared.ts`.
 */

import type { ModelDef } from '@gsbio/engine';

export const radialSpreadModel: ModelDef = {
  id: 'radial-spread',
  name: 'Radial Spread',
  description:
    'Trivial biological mock — each drawn Spread_zone circle is rasterised by ' +
    'a WASM kernel into a distance-shaded image whose intensity falls off from ' +
    'the centre, as a stand-in for radial population spread from a source point.',
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
