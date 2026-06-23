/**
 * Radial Spread (API) — demo model (archetype B: fetch from a backend API).
 *
 * Same radial-spread biology as the WASM archetype — each drawn
 * `Spread_zone` circle becomes a distance-shaded raster whose intensity falls
 * off from the centre — but the compute is framed as a backend job. The
 * executor POSTs the circles to a mock API, polls for completion, then wraps
 * the returned XYZ tile-URL template in a `tiles` envelope. The mock server
 * (`apps/demo-web/src/mock/fakeApi.ts`) shades each tile on demand with the
 * same warm ramp as the WASM kernel, so the only visible difference between
 * the two archetypes is the compute path (in-browser WASM vs RPC + tiles).
 *
 * This file holds only the model schema (`ModelDef`); the executor that runs
 * the computation lives in `./executor.ts`. The per-tile rasteriser used by
 * the mock server lives in `./tileShade.ts`. Shared circle-helpers
 * (`selectSpreadZones`) live in `../shared.ts`.
 */

import type { ModelDef } from '@gsbio/core';

export const radialSpreadApiModel: ModelDef = {
  id: 'radial-spread-api',
  name: 'Radial Spread (API)',
  description:
    'Distance-decay raster via a mock backend — drawn Spread_zone circles ' +
    'are POSTed to an API that rasterises each into a distance-shaded XYZ ' +
    'tile service; the result is rendered as a `tiles` envelope. Same ' +
    'biology as the WASM archetype, different compute path.',
  params: [
    {
      key: 'resolution',
      label: 'Tile sample blocks',
      type: 'range',
      min: 4,
      max: 32,
      step: 4,
      default: 8,
    },
  ],
};