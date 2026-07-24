/**
 * Radial Spread: demo model.
 *
 * This file holds only the model schema (`ModelDef`); the executor that runs
 * the computation lives in `./executor.ts`. Shared circle-helpers
 * (`selectSpreadZones`, `circleBounds`) live in `../shared.ts`.
 */

import type { ModelDef } from '@gsbio/engine';

export const radialSpreadModel: ModelDef = {
  id: 'radial-spread',
  name: 'Radial Spread',
  description: 'Simple mock model',
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
