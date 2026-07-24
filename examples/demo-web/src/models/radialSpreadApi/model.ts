/**
 * Radial Spread (API): demo model.
 */

import type { ModelDef } from '@gsbio/engine';

export const radialSpreadApiModel: ModelDef = {
  id: 'radial-spread-api',
  name: 'Radial Spread (API)',
  description:
    'Just another example',
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
