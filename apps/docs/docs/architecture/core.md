# `@catshark/core`

The headless engine. **No React, no maplibre, no network.** This package is
the single source of truth for the data model and runtime state, and is the
only package the analysis side, the render side, and the network side all
depend on.

It is importable from Node.js (running simulations on a server), from a Web
Worker (background processing), or from the browser (the demo app). Nothing
in `core` reads `window`, `document`, or any fetch API.

## Public surface

```ts
// src/index.ts
export * from './types';          // DrawnFeature, DrawMode, ModelDef, DataSourceDef, Renderer, ...
export * from './spatial';        // CoordinateService, pointInPolygon, polygonArea, haversineDistanceMeters
export * from './data/sourceRegistry';
export * from './models/registry';
export * from './models/helloWorld';
export * from './state/drawSlice';
export * from './state/modelSlice';
export { SimulationEngine, createSimulationEngine, runModel } from './engine';
```

## `SimulationEngine`

[`packages/core/src/engine.ts`](https://github.com/anomalyco/catshark-engine/tree/main/packages/core/src/engine.ts)
— the stateful coordinator. A single instance owns:

- the **draw state tree** (features, selected feature id, current draw mode),
- the **model state tree** (selected model id, resolved params, running flag, last-run time),
- a set of **listeners** (the React layer subscribes via `useSyncExternalStore`),
- a single optional **`DrawMapActions` bridge** registered by whichever renderer is currently mounted.

### API

```ts
class SimulationEngine {
  subscribe(listener: () => void): () => void;   // external-store contract
  getSnapshot(): EngineState;                    // external-store contract

  dispatchDraw(action: DrawAction): void;         // raw dispatch into drawSlice
  dispatchModel(action: ModelAction): void;       // raw dispatch into modelSlice

  setMapActions(actions: DrawMapActions): void;  // renderer registers its bridge

  startDrawing(mode: DrawMode): void;
  selectMode(): void;
  removeFeature(id: string): void;                // dispatch + mapActions.removeFeatureFromMap
  toggleVisibility(id: string): void;            // dispatch + mapActions.setFeatureVisibility
}

function runModel(engine: SimulationEngine, features: ReadonlyArray<DrawnFeature>): void;
function createSimulationEngine(): SimulationEngine;
```

### External-store contract

`subscribe` + `getSnapshot` make the engine directly consumable by React's
[`useSyncExternalStore`](https://react.dev/reference/react/useSyncExternalStore),
which is how `@catshark/react` reads state without React owning it. The
engine never imports React.

### Emission model

Every dispatched action produces a **new top-level `EngineState` object** and
synchronously notifies every listener. Reducers themselves are pure and
return immutable updates; the engine's `patch()` swaps the slice in
`_state` and calls `emit()`.

### Imperative bridge

Pure state transitions can't move a marker on a canvas — they need an
imperative call into the renderer. The engine defines the
[`DrawMapActions`](https://github.com/anomalyco/catshark-engine/tree/main/packages/core/src/types.ts)
contract for those escape hatches:

```ts
interface DrawMapActions {
  removeFeatureFromMap: (id: string) => void;
  setFeatureVisibility: (id: string, visible: boolean, geojson: GeoJSON.Feature) => void;
}
```

A renderer (`@catshark/renderer-2d`) implements this interface and registers
it via `engine.setMapActions(impl)` during `mount()`. The engine calls into
it after dispatching the matching state change, so the canonical record (the
engine) updates atomically and the renderer mirrors it. If no renderer is
attached, the calls are skipped — headless operation (Node, worker) works
without one.

## State slices

State is split into two reducers, both pure and unit-tested:

### `drawSlice`

[`packages/core/src/state/drawSlice.ts`](https://github.com/anomalyco/catshark-engine/tree/main/packages/core/src/state/drawSlice.ts)

```ts
interface DrawState {
  features: DrawnFeature[];
  selectedFeatureId: string | null;
  drawMode: DrawMode;            // 'select' | 'point' | 'linestring' | 'polygon'
}

type DrawAction =
  | { type: 'ADD_FEATURE'; payload: DrawnFeature }
  | { type: 'REMOVE_FEATURE'; payload: string }
  | { type: 'UPDATE_FEATURE'; payload: { id: string; updates: Partial<DrawnFeature> } }
  | { type: 'SELECT_FEATURE'; payload: string | null }
  | { type: 'SET_DRAW_MODE'; payload: DrawMode }
  | { type: 'CLEAR_ALL' };

function drawReducer(state: DrawState, action: DrawAction): DrawState;
function geometryKindForMode(mode: DrawMode): GeometryKind;  // 'select' → 'point'
```

### `modelSlice`

[`packages/core/src/state/modelSlice.ts`](https://github.com/anomalyco/catshark-engine/tree/main/packages/core/src/state/modelSlice.ts)

```ts
interface ModelState {
  modelId: string;
  params: ModelParams;            // Record<string, number>
  isRunning: boolean;
  lastRunAt: number | null;
}

type ModelAction =
  | { type: 'SET_MODEL'; payload: string }      // resets params to defaults
  | { type: 'SET_PARAM'; payload: { key: string; value: number } }
  | { type: 'SET_PARAMS'; payload: ModelParams }
  | { type: 'RUN_START' }
  | { type: 'RUN_FINISH' };

function modelReducer(state: ModelState, action: ModelAction): ModelState;
```

`SET_MODEL` reads the registry's `defaultParamsFor(model)` so switching
models always starts from the model's own defaults (never inherits the
previous model's numbers).

### Why slices live in `core`, not in React

The original code kept `drawReducer` inside `DrawContext.tsx`. Moving the
reducers into `core` means:

- they run in Node tests without `jest-dom` / `jsdom`,
- the same shape is reusable by non-React consumers (CLI, workers, SSR),
- `@catshark/react` is reduced to a thin subscription layer.

## Registries

### Model registry

[`packages/core/src/models/registry.ts`](https://github.com/anomalyco/catshark-engine/tree/main/packages/core/src/models/registry.ts)

```ts
function registerModel(def: ModelDef): void;        // replaces by id
function getModel(id: string): ModelDef | undefined;
function listModels(): ModelDef[];
function defaultParamsFor(model: ModelDef): Record<string, number>;
function ensureDefaultModels(): void;               // idempotent bootstrap
```

`helloWorldModel` is registered by default — a no-op stub that logs its
params and feature count to prove the pipeline end-to-end. Replace it with
real models by calling `registerModel` from anywhere in your app's bootstrap.

### Data-source registry

[`packages/core/src/data/sourceRegistry.ts`](https://github.com/anomalyco/catshark-engine/tree/main/packages/core/src/data/sourceRegistry.ts)

```ts
function registerDataSource(def: DataSourceDef): void;
function getDataSource(id: string): DataSourceDef | undefined;
function listDataSources(): DataSourceDef[];
function removeDataSource(id: string): boolean;
function ensureDefaultDataSources(): void;         // idempotent bootstrap
const DRAWN_SOURCE_ID = 'drawn-features';
```

`DataSourceKind` is `'drawn' | 'upload'`. The engine pre-registers the
`drawn-features` source; upload / tile / model-output sources are registered
by `@catshark/client`.

## `CoordinateService`

[`packages/core/src/spatial.ts`](https://github.com/anomalyco/catshark-engine/tree/main/packages/core/src/spatial.ts)

The engine stores geometry in `Longitude/Latitude`. The View needs pixels.
`CoordinateService` is the shared bridge: a renderer supplies a projection
function pair, and both the analysis side and the render side use the
service to talk about coordinates.

```ts
class CoordinateService {
  constructor(project: (lngLat: LngLat) => Pixel, unproject: (pixel: Pixel) => LngLat);
  lngLatToPixel(lngLat: LngLat): Pixel;
  pixelToLngLat(pixel: Pixel): LngLat;
  pointInPolygon(point: LngLat, ring: LngLat[]): boolean;
}
```

The package also exports pure spatial helpers that don't need a renderer
attached and work anywhere (Node, worker):

```ts
function pointInPolygon(point: LngLat, ring: LngLat[]): boolean;     // ray casting
function polygonArea(ring: LngLat[]): number;                         // shoelace (degree²)
function haversineDistanceMeters(a: LngLat, b: LngLat): number;       // great-circle distance
const WGS84_EARTH_RADIUS_M = 6378137;
```

Use these inside `ModelDef.run` for spatial queries ("is this observation
point inside the study polygon?") without touching the canvas.

## `Renderer` port

```ts
interface Renderer {
  mount(container: HTMLElement, engine: unknown): void | Promise<void>;
  unmount(): void | Promise<void>;
}
```

Defined in `core` so every renderer speaks the same shape; see
[Renderers](./renderers.md). The `engine` argument is typed `unknown`
deliberately — renderers cast it to `SimulationEngine` to avoid a hard
runtime dependency from the render package on `core`'s class instance.
They already depend on `core`'s types; this keeps the API honest about
hiding the class identity behind the port.

## Testing

`packages/core/__tests__/` runs in `vitest` with `environment: 'node'`
(see `packages/core/vitest.config.ts`). No DOM, no jsdom, no React — pure
reducer + registry unit tests, 21 cases total across three suites
(`drawSlice`, `modelSlice`, `sourceRegistry`). Every reducer test was
preserved one-to-one from the pre-refactor app-layer tests; only import
paths changed.