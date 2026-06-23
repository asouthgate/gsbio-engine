# gsbio Engine docs

An open-source headless engine for biological spatial modelling on maps (or other manifolds).

gsbio separates three concerns so models, data, and rendering stay decoupled:

- **Drawing layer** — generic geometry tools (point / line / polygon / circle) that produce features. No domain semantics.
- **Data-source layer** — a registry of data sources. Drawn features are one built-in source; uploads register the same way.
- **Model layer** — a registry of model plugins. Each model declares a parameter schema and a separate executor runs its computation. The bundled `hello-world` model proves the pipeline end-to-end.

See [architecture.md](./architecture.md) for the layer contract and package map.

## Quick start

Requires Node 22+ and pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`).

```bash
pnpm install
pnpm dev          # start the demo-web Vite dev server
pnpm test         # vitest, via turbo
pnpm typecheck    # `tsc -b` across the composite package graph
pnpm lint         # eslint across the workspace
pnpm build        # build apps via turbo
```

## Registering a model

A model is a pure schema (`ModelDef`); its computation lives in a separate `Executor`, bound to the model by id at registration time.

```ts
import { createSimulationEngine, type ModelDef, type Executor } from '@gsbio/core';

const myModel: ModelDef = {
  id: 'my-model',
  name: 'My Model',
  params: [
    { key: 'iterations', label: 'Iterations', type: 'number', min: 1, max: 10000, default: 200 },
    { key: 'diffusionRate', label: 'Diffusion rate', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2 },
  ],
};

const myExecutor: Executor = {
  async preprocess(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return { payload: { params: ctx.params, features: ctx.features } };
  },
  async submit(ctx, signal) {
    // ...your simulation — call ctx.onProgress for progress updates,
    // honour the AbortSignal, return result layers as MapLayerEnvelopes...
    return { layers: [], summary: {} };
  },
};

const engine = createSimulationEngine();
engine.registerModel(myModel);
engine.registerExecutor(myModel.id, myExecutor);
engine.dispatchModel({ type: 'SET_MODEL', payload: myModel.id });
```

Models are pure data and never import React or maplibre; executors handle the computation and may use browser APIs (DOM canvas, workers, `fetch`) as needed.

## License

MIT (pending).