# Architecture

Catshark is a **headless spatial-modelling engine**: the core owns the data model and runtime state; the React package and renderer plugins adapt it to UI; runnable apps live under `apps/`.

## Why headless?

The engine is the **single source of truth** — it owns the data model whether that data is being rendered, exported, or sent to a worker. Couples visual representation (drawing instructions) with the underlying model is a known dead end:

- Analysis logic becomes untestable without mounting a DOM and mocking a canvas context.
- Every property update risks re-rendering the canvas even when only background data changed.
- UI components end up carrying "how do I represent this feature?" instead of "display what the engine tells me."

Three rules follow:

1. **Data is stored as geometric models, not drawing instructions.** A polygon is a GeoJSON feature in engine state — not a `fillStyle` + `path` on a canvas. Spatial queries (`polygonArea`, `pointInPolygon`, `haversineDistanceMeters`) run without a renderer attached.
2. **Models subscribe to data, not to the canvas.** A compute provider receives `{ params, features, ... }` and returns a result. No import path to maplibre, React, or the DOM.
3. **Network is owned by providers, not by the view.** React components never see URLs, API keys, or binary parsing; they ask the engine for state and the engine asks `@catshark/client` for raw data.

## Layer responsibilities

| Layer | Responsibility | Package |
| --- | --- | --- |
| Data source / storage | Manage raw GIS / map data, feature attributes, spatial indexing. | `@catshark/core` (registries) + `@catshark/client` (fetching) |
| Analysis plugin | Take inputs, perform math, return results. | `@catshark/core` (`ModelDef` + `ComputeProvider`) |
| Engine core | Coordinate events, provide the projection service, own the state tree. | `@catshark/core` (`SimulationEngine`) |
| View (React / Canvas) | Listen for state changes and paint. | `@catshark/react` + `@catshark/react-ui` + a renderer plugin |

## The one bridge: coordinate / projection

Storage is decoupled from rendering, but both sides need to speak the same coordinate language. The engine stores geometry in **longitude / latitude** (geographic, renderer-agnostic). The view needs pixels.

`CoordinateService` (in `@catshark/core`) exposes projection functions both sides share. The analysis side uses them for spatial queries (`pointInPolygon`); the render side uses them for drawing (`lngLatToPixel`). The projection function pair is supplied by the renderer — maplibre provides `map.project` / `map.unproject`, a WebGPU renderer would supply its own — so the engine stays free of any map library.

## Package map

```
apps/
  demo-web/      runnable consumer — proves the public API end-to-end
packages/
  core/          SimulationEngine + state slices + registries + CoordinateService
  react/         useEngine/useDraw/useModel + providers + renderer-agnostic <Canvas>
  react-ui/      headless presentational components: <DrawToolbar>, <ModelForm>, <FeatureList>, <MapScene>, <RunPanel>, <ResultsPanel>
  renderer-2d/   MapLibre + TerraDraw adapter (implements the Renderer port)
  renderer-3d/   WebGL / WebGPU stub (implements the same Renderer port)
  client/        OSM tile provider, upload data-source helper
  tsconfig-base/ shared TS configs
```

## `@catshark/core`

The headless engine. **No React, no maplibre, no network.** Single source of truth for the data model and runtime state. Importable from Node, a Web Worker, or the browser.

Key exports:

- `SimulationEngine` / `createSimulationEngine()` — the stateful coordinator. Owns draw / model / run state trees, listeners, an optional `MapActions` bridge (registered by the mounted renderer), and a per-model `ComputeProvider` registry.
- State slices `drawSlice`, `modelSlice`, `runSlice` — pure reducers, unit-tested in `environment: 'node'` (no jsdom).
- Registries: `registerModel` / `registerDataSource`, plus `ensureDefaultModels` / `ensureDefaultDataSources` for bootstrap.
- `CoordinateService` and pure spatial helpers (`pointInPolygon`, `polygonArea`, `haversineDistanceMeters`).
- The `Renderer` port interface — every renderer speaks the same shape.

Engine ↔ React goes through `useSyncExternalStore` (`engine.subscribe` / `engine.getSnapshot`); the engine imports nothing from React. Engine ↔ renderer goes through the `Renderer` port (`mount` / `unmount`) plus an imperative `MapActions` bridge the renderer registers via `engine.setMapActions()`; if no renderer is attached, the calls are skipped — headless operation works without one.

The run pipeline (`engine.run()`) is async, single-in-flight, and cancellable. `ComputeProvider` splits into `preprocess` (browser-side: simplify, reproject, validate, build payload) and `submit` (the expensive backend roundtrip / streaming compute). Both receive the engine's `AbortSignal` so cancellation is observable.

## `@catshark/react`

The thin React adapter. **Zero simulation logic, zero rendering-backend knowledge.** Maps the engine's `EngineState` into React's reactive system and hosts a renderer-agnostic `<Canvas>`.

Provides `EngineProvider`, `AppProvider` (composite), `DataSourceProvider`, and hooks `useEngine`, `useEngineState`, `useDraw`, `useModel`, `useRun`, `useResults`, `useDataSources`. The package `peerDepends` on `react` / `react-dom` and `@catshark/core`; no dependency on `maplibre-gl`, `terra-draw`, or any WebGPU library.

`<Canvas renderer={...} />` owns a container `<div>` and asks the supplied `Renderer` plugin to mount/unmount against the current engine. It knows nothing about maplibre, WebGL, or WebGPU. React 19 Strict Mode double-mounts are handled via a `cancelled` flag so the first mount's async cleanup doesn't race the second mount.

If a hook here grows past "map state to React" it's a signal that logic belongs in `core`.

## `@catshark/react-ui`

Headless **presentational** components that project the engine's slices into the canonical draw → configure → run workflow. Sibling package to `@catshark/react`; lets the engine ship the workflow scaffolding once instead of having every domain app re-author it.

Six thin components, each a 1:1 projection of an engine slice: `<DrawToolbar>`, `<ModelForm>`, `<RunPanel>`, `<ResultsPanel>`, `<FeatureList>`, `<MapScene>`. Nothing here contains simulation logic, rendering-backend code, or shipped CSS — components emit **stable class names** and consumers vendor (`apps/demo-web` ships the reference stylesheet), override via `className`, or write their own.

`<DrawToolbar>` `tools` prop subsets/relabels the closed set of draw modes (`select` / `point` / `linestring` / `polygon` / `circle`). Two tools may share a `mode` with different labels — the label flows through to the feature's `category` and is read-only from the panel. Icons are optional and anything renderable.

Circles are stored as **two views of the same feature**: `feature.circle = { center, radiusMeters }` (semantic truth for analysis) and `feature.geojson` (a 64-segment polygon approximation for rendering). The polygon is always a fixed function of `(center, radiusMeters)`; on-map drag/scale recomputes the canonical circle from the dragged approximation and snaps back.

## Renderers

Each renderer is a package that:

1. depends on `@catshark/core` for types (and optionally the `SimulationEngine` class),
2. implements the `Renderer` port (`mount(container, engine)` / `unmount()`),
3. consumes engine state via `engine.subscribe()` / `engine.getSnapshot()`,
4. calls back into the engine via `engine.dispatchDraw(...)` on user input,
5. registers an imperative `DrawMapActions` + `ResultLayerActions` bridge via `engine.setMapActions()`.

Engine → renderer goes through `MapActions` (the engine mutates the canvas). Renderer → engine goes through `engine.dispatchDraw(...)`. Both directions are explicit and go through the engine; neither side reads the other's internals.

`@catshark/renderer-2d` — MapLibre + TerraDraw. `@catshark/renderer-3d` — WebGPU stub (its `mount()` rejects; a placeholder so the demo's error handling is exercisable).

Renderers are separate packages so consumers pay for what they use (a 2D-only consumer doesn't install WebGPU/WASM toolchain) and so renderer choice is a runtime concern (swap via the `<Canvas renderer={...}>` prop without touching anything else). Neither renderer imports from `@catshark/react`.

## `@catshark/client`

Network and storage providers. The engine owns data-source **registration** (in `@catshark/core`); `@catshark/client` owns the **fetching** — tile sources, uploads, model outputs. React components never import from here; apps and bootstrap code wire providers into the engine.

Today: `OSM_RASTER_STYLE` (a MapLibre raster style spec pointing at OpenStreetMap), and `registerUploadedDataSource` (builds a `DataSourceDef` with `kind: 'upload'`). Coming: a `TileProvider` abstraction, async `UploadProvider` pipelines, and a `ModelOutputProvider`.

If `core` imported `fetch` it would no longer be usable in pure-Node contexts. Keeping the engine headless means it has **no URL strings, no API keys, no parsers** anywhere in its source tree. Boundary rule: `@catshark/client` may import from `@catshark/core`; never the reverse.

## What never changes

- The engine's public state shape (`EngineState`) and the `Renderer` port interface are the two contracts everything else hangs off.
- `@catshark/core` imports nothing from React, maplibre, terra-draw, or the network. If a future change needs any of those, the change belongs in another package — not in `core`.