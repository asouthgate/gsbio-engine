# Catshark Engine

An open-source headless engine for biological spatial modelling on maps
(or other manifolds).

Catshark separates three concerns so models, data, and rendering stay
decoupled:

- **Drawing layer** — generic geometry tools (point / line / polygon) that
  produce user features. No domain semantics baked in.
- **Data-source layer** — a registry of data sources. The drawn features are
  one built-in source; upload sources (CSV / GeoJSON / raster) register the
  same way.
- **Model layer** — a registry of model plugins. Each model declares its own
  parameter schema and a `run` callback. The default `hello-world` model is
  a no-op stub that proves the pipeline end-to-end.

Start with the [architecture overview](./architecture.md), then read each
layer's page:

- [`@catshark/core`](./architecture/core.md) — headless `SimulationEngine`,
  state slices, registries, `CoordinateService`.
- [`@catshark/react`](./architecture/react.md) — `useEngine`, providers, the
  renderer-agnostic `<Canvas>`.
- [Renderers](./architecture/renderers.md) — the `Renderer` port plus the
  2D (MapLibre + TerraDraw) and 3D (WebGPU stub) plugins.
- [`@catshark/client`](./architecture/client.md) — tile sources, upload
  providers, network boundary.
- [Data flow](./architecture/data-flow.md) — an end-to-end trace of a
  draw → edit → run-model cycle.
- [Conventions](./architecture/conventions.md) — workspace scripts,
  TypeScript project references, testing, and linting.

## Monorepo layout

```
/
├── apps/
│   ├── demo-web/     # Vite + React runnable consumer (acts as integration test)
│   └── docs/         # This Docusaurus site
├── packages/
│   ├── core/         # Headless engine (no React / maplibre / network)
│   ├── react/        # React hooks + renderer-agnostic Canvas
│   ├── renderer-2d/  # MapLibre + TerraDraw renderer
│   ├── renderer-3d/  # WebGL / WebGPU (stub)
│   ├── client/       # Network/storage providers (tile/upload fetchers)
│   └── tsconfig-base/
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## Quick start

Requires Node 22+ and pnpm 9.

```bash
corepack enable && corepack prepare pnpm@9 --activate
pnpm install
pnpm dev          # runnable demo app at http://localhost:5173
pnpm test         # vitest
pnpm typecheck    # tsc -b across the composite package graph
pnpm build        # turbo build (demo-web + docs bundles)
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

The model receives `{ params, features }` and runs anywhere — browser,
Web Worker, or Node. It never imports React or maplibre.

## License

MIT (pending).