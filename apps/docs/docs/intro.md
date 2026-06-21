# Catshark Engine

An open-source headless engine for biological spatial modelling on maps (or other manifolds).

Catshark separates three concerns so models, data, and rendering stay decoupled:

- **Drawing layer** — generic geometry tools (point / line / polygon) that produce user features. No domain semantics baked in.
- **Data-source layer** — a registry of data sources. The drawn features are one built-in source; upload sources (CSV / GeoJSON / raster) can be registered the same way.
- **Model layer** — a registry of model plugins. Each model declares its own parameter schema and a `run` callback. The default `hello-world` model is a no-op stub that proves the pipeline end-to-end.

## Monorepo layout

```
/
├── apps/
│   ├── demo-web/     # Vite/React runnable consumer of the engine
│   └── docs/         # This Docusaurus site
├── packages/
│   ├── core/         # Headless engine (no React / maplibre / network)
│   ├── react/        # React hooks + renderer-agnostic Canvas
│   ├── renderer-2d/  # MapLibre + TerraDraw renderer
│   ├── renderer-3d/  # WebGL / WebGPU (stub)
│   └── client/       # Network/storage providers (tile/upload fetchers)
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
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