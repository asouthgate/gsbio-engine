# Architecture

Catshark Engine is a **headless spatial-modelling engine**: the core owns the
data model and runtime state; the React package and renderer plugins adapt it
to UI; runnable apps and the docs site live under `apps/`.

## Why a headless engine?

The engine acts as the **Single Source of Truth** — it manages the data model
regardless of whether that data is currently being rendered on a screen,
exported to a report, or sent to a worker thread.

Coupling the visual representation (drawing instructions) with the underlying
model (storage + analysis) hits a hard wall:

- **Testing is impossible** — you can't exercise analysis logic without
  mounting a DOM element and mocking a Canvas context.
- **Performance degrades** — every property update risks re-rendering the
  canvas even when only a background data point changed.
- **State bloat** — UI components end up carrying "how do I represent this
  map feature?" instead of just "display what the engine tells me to."

To avoid this, Catshark follows three rules:

1. **Data is stored as Geometric Models, not as drawing instructions.** A
   polygon is a GeoJSON feature in engine state — not a `fillStyle` + `path`
   on a canvas. Analyses (`polygonArea`, `pointInPolygon`,
   `haversineDistanceMeters`) run without a renderer attached.
2. **Models subscribe to data, not to the canvas.** A `ModelDef` receives
   `{ params, features }` and returns a result. It has no import path to
   maplibre, React, or the DOM.
3. **Network is owned by providers, not by the view.** React components have
   zero knowledge of URLs, API keys, or binary parsing; they ask the engine
   for map state and simulation state, and the engine asks `@catshark/client`
   for raw data.

## Layer responsibilities

| Layer | Responsibility | Package |
| --- | --- | --- |
| Data Source / Storage | Manage raw GIS / map data, feature attributes, spatial indexing. | `@catshark/core` (registries) + `@catshark/client` (fetching) |
| Analysis Plugin | Take inputs, perform math, return results. | `@catshark/core` (`ModelDef`) |
| Engine Core | Coordinate events, provide the Projection service, own the state tree. | `@catshark/core` (`SimulationEngine`) |
| View (React / Canvas) | Listen for state changes and paint the result on screen. | `@catshark/react` + `@catshark/renderer-2d` |

## The one bridge: coordinate / projection

Storage is decoupled from rendering, but both sides need to speak the same
coordinate language. The engine stores geometry in **longitude / latitude**
(geographic, renderer-agnostic). The View needs pixels.

`@catshark/core`'s [`CoordinateService`](./architecture/core.md#coordinateservice) exposes
projection functions both sides share. The analysis side uses them for spatial
queries (`pointInPolygon`); the render side uses them for drawing
(`lngLatToPixel`). The actual projection function pair is supplied by the
renderer — maplibre provides `map.project` / `map.unproject`, a WebGPU
renderer would supply its own — so the engine stays free of any map library.

## Package map

```
apps/
  demo-web/      runnable consumer — proves the public API works end-to-end
  docs/          this site
packages/
  core/          SimulationEngine + state slices + registries + CoordinateService
  react/         useEngine/useDraw/useModel + providers + renderer-agnostic <Canvas>
  react-ui/      headless presentational components: <DrawToolbar>, <ModelForm>, <FeatureList>, <MapScene>
  renderer-2d/   MapLibre + TerraDraw adapter (implements the Renderer port)
  renderer-3d/   WebGL / WebGPU stub (implements the same Renderer port)
  client/        OSM tile provider, upload data-source helper
  tsconfig-base/ shared TS configs
```

## Continue reading

- [`@catshark/core`](./architecture/core.md) — the headless `SimulationEngine`, state slices, registries, and `CoordinateService`.
- [`@catshark/react`](./architecture/react.md) — the thin React adapter: providers, hooks, and the renderer-agnostic `<Canvas>`.
- [`@catshark/react-ui`](./architecture/react-ui.md) — headless presentational components over the engine slices: `<DrawToolbar>`, `<ModelForm>`, `<FeatureList>`, `<MapScene>`.
- [Renderers](./architecture/renderers.md) — the `Renderer` port and the 2D / 3D plugins.
- [`@catshark/client`](./architecture/client.md) — tile sources, upload providers, network boundaries.
- [Data flow](./architecture/data-flow.md) — end-to-end trace of a draw → edit → run model cycle.
- [Conventions](./architecture/conventions.md) — workspace scripts, TypeScript project references, testing, linting.