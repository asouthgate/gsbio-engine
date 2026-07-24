import type { ModelDef } from '@gsbio/engine';

export const radialSpreadApiModel: ModelDef = {
  id: 'radial-spread-api',
  name: 'Radial Spread (API)',
  description: 'Runs via a simulated backend API (same compute, different path).',
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
