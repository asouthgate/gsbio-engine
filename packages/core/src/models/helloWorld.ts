import type { ModelDef } from '../types';

/** Default stub model: pure schema. The engine pipeline end-to-end is
 *  exercised via `noopComputeProvider` (see `./registry.ts`); real models
 *  ship their own `ComputeProvider`. */
export const helloWorldModel: ModelDef = {
  id: 'hello-world',
  name: 'Hello World',
  description:
    'A minimal demonstration model. It accepts a few parameters and runs an in-browser no-op compute provider.',
  params: [
    { key: 'iterations', label: 'Iterations', type: 'number', min: 1, max: 10000, step: 1, default: 100 },
    { key: 'diffusionRate', label: 'Diffusion rate', type: 'range', min: 0, max: 1, step: 0.01, default: 0.1 },
    { key: 'threshold', label: 'Threshold', type: 'range', min: 0, max: 1, step: 0.01, default: 0.5 },
  ],
};