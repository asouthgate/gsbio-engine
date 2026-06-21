# Catshark Engine

An open-source headless engine for biological spatial modelling on maps (or other manifolds).

Catshark is structured as a pnpm + TurboRepo monorepo. The headless core owns
the data model and runtime state; the React package and renderer plugins adapt
it to UI; runnable apps and the docs site live under `apps/`.

## Layout

```
/
├── apps/
│   ├── demo-web/     # Vite + React runnable consumer of the engine
│   └── docs/         # Docusaurus documentation site
├── packages/
│   ├── core/         # Headless `SimulationEngine` (no React / maplibre / network)
│   ├── react/        # `useEngine`, providers, renderer-agnostic `<Canvas>`
│   ├── renderer-2d/  # MapLibre + TerraDraw renderer plugin
│   ├── renderer-3d/  # WebGL / WebGPU (stub)
│   ├── client/       # Tile / upload / model-output providers (network)
│   └── tsconfig-base/
├── pnpm-workspace.yaml
├── turbo.json
├── tsconfig.json
└── package.json
```

## Getting started

Requires Node 22+ and pnpm 9 (`corepack enable && corepack prepare pnpm@9 --activate`).

```bash
pnpm install
pnpm dev          # start the demo-web Vite dev server
pnpm test         # run package tests (vitest, via turbo)
pnpm typecheck    # `tsc -b` across the composite package graph
pnpm lint         # eslint across the workspace
pnpm build       # build apps (demo-web + docs) via turbo
```

## Registering a model

```ts
import { registerModel } from '@catshark/core';

registerModel({
  id: 'my-model',
  name: 'My Model',
  params: [
    { key: 'iterations', label: 'Iterations', type: 'number', min: 1, max: 10000, default: 200 },
    { key: 'diffusionRate', label: 'Diffusion rate', type: 'range', min: 0, max: 1, step: 0.01, default: 0.2 },
  ],
  run: ({ params, features }) => {
    // ...your simulation...
  },
});
```

## License

MIT (pending).