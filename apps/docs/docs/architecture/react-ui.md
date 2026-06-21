# `@catshark/react-ui`

Headless **presentational** components that project the engine's slices
into the canonical draw → configure → run workflow. Sibling package to
`@catshark/react`; lets the engine ship the workflow scaffolding once
instead of having every domain app re-author it.

## What lives here

Four thin components, each a 1:1 projection of an engine slice. They call
hooks already defined in `@catshark/react` and introspect model/data-source
registries in `@catshark/core`. Nothing here contains simulation logic,
rendering-backend code, or shipped CSS.

| Component | Projections | Notes |
| --- | --- | --- |
| `<DrawToolbar>` | `draw.drawMode` + 4 dispatchable `DrawMode`s | emits `draw-btn` / `draw-btn active` classes |
| `<ModelForm>` | `model` slice + `listModels()`/`getModel()` + `ModelParamDef` | drives `SET_MODEL` / `SET_PARAM`, run button calls `run(drawState.features)` |
| `<FeatureList>` | `sources` + `draw.features` | source-grouped, per-feature edit/visibility/remove |
| `<MapScene>` | `<Canvas>` + positions an overlay context | renderer/tiles stay domain-supplied via the `renderer` prop |

## Imports

```tsx
import { DrawToolbar, ModelForm, FeatureList, MapScene } from '@catshark/react-ui';
```

## Styling — the engine ships no CSS

Components emit **stable class names** (e.g. `draw-toolbar`, `draw-btn`,
`data-feature-item`, `panel-section`, `map-wrapper`, `map-view`). Consumers
either:

- vendor [`apps/demo-web/src/styles/index.css`](https://github.com/anomalyco/catshark-engine/tree/main/apps/demo-web/src/styles/index.css) — it is the **reference stylesheet** and is kept in sync with the class names emitted here, or
- write their own CSS targeting the same class names, or
- override individual components' `className` prop (each accepts an
  optional override so a domain app can rename classes and ship its own
  stylesheet without forking the components themselves).

## Arrangement — the consumer's job

A domain app owns:

1. **Styling** — the CSS, vendored or bespoke.
2. **Arrangement** — composing `<MapScene>`, `<DrawToolbar>`, `<ModelForm>`,
   `<FeatureList>` into its own `<App>` / `<SidePanel>` / section chrome.
3. **Simulation workflow logic** — the `ModelDef`s it `registerModel(…)`s.
   The engine runs them; `<ModelForm>` is generic over any registered model.

`<MapScene>` only owns the overlay-positioning idiom (a relatively-positioned
wrapper around `<Canvas>`). The renderer instance and tile style remain
domain-supplied via the `renderer` prop — so a 3D/WebGPU renderer can drop in
without touching the scene.

## What's deliberately **not** here

- Simulation logic. Lives in `@catshark/core`.
- Rendering backend. Lives in `@catshark/renderer-*`.
- Tile URL strings / network. Lives in `@catshark/client`.
- Result / post-run visualisation. Belongs to future frontend
  functionality (e.g. WebGL result overlays); a domain app would compose
  it as another `<SidePanel>` section reading the same `useModel()` state
  once the engine exposes a result slice.

If a component here starts needing to *compute* rather than *display*,
that logic belongs in `core`; if it starts needing maplibre/WebGL/map URLs,
that belongs in renderer/client. The presentational layer is the only
place layout-over-engine-state chrome belongs.