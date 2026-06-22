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
export * from './types';          // DrawnFeature, DrawMode, ModelDef, ComputeProvider, RunStatus, MapLayerEnvelope, ...
export * from './spatial';        // CoordinateService, pointInPolygon, polygonArea, haversineDistanceMeters, extractLayerEnvelope
export * from './data/sourceRegistry';
export * from './models/registry';
export * from './models/helloWorld';
export * from './state/drawSlice';
export * from './state/modelSlice';
export * from './state/runSlice';
export { SimulationEngine, createSimulationEngine, type MapActions } from './engine';
```

## `SimulationEngine`

[`packages/core/src/engine.ts`](https://github.com/anomalyco/catshark-engine/tree/main/packages/core/src/engine.ts)
— the stateful coordinator. A single instance owns:

- the **draw state tree** (features, selected feature id, current draw mode),
- the **model state tree** (selected model id, resolved params),
- the **run state tree** (the current/last run, history of past runs),
- a set of **listeners** (the React layer subscribes via `useSyncExternalStore`),
- a single optional **`MapActions` bridge** — `DrawMapActions & ResultLayerActions` — registered by whichever renderer is currently mounted,
- a per-model registry of **`ComputeProvider`** implementations (the engine never executes model logic itself).

### API

```ts
class SimulationEngine {
  subscribe(listener: () => void): () => void;   // external-store contract
  getSnapshot(): EngineState;                    // external-store contract

  dispatchDraw(action: DrawAction): void;         // raw dispatch into drawSlice
  dispatchModel(action: ModelAction): void;       // raw dispatch into modelSlice
  dispatchRun(action: RunAction): void;           // raw dispatch into runSlice

  setMapActions(actions: MapActions): void;      // renderer registers its bridge (draw + result layers)

  // Compute-provider registry
  registerComputeProvider(modelId: string, provider: ComputeProvider): void;
  getComputeProvider(modelId: string): ComputeProvider | undefined;

  // Draw helpers
  startDrawing(mode: DrawMode, category?: string): void;
  selectMode(): void;
  removeFeature(id: string): void;
  toggleVisibility(id: string): void;
  updateCircle(id: string, patch: Partial<CircleGeometry>): void;
  updatePointPosition(id: string, lngLat: LngLat): void;
  updateLineStringCoords(id: string, coords: LngLat[]): void;
  updatePolygonRing(id: string, ring: LngLat[]): void;

  // Run pipeline (async, single in-flight, cancellable)
  run(): Promise<void>;                           // cancels any in-flight run, then starts a new one
  cancelRun(): void;                              // aborts the in-flight run, if any

  // Result visibility / history management
  showResult(runId: string): void;                // adds the result layer to the map
  hideResult(runId: string): void;                // removes the result layer
  toggleResult(runId: string): void;
  clearResult(runId: string): void;               // removes from history + removes map layer
  clearAllResults(): void;
  findRun(runId: string): RunRecord | undefined;
}

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
imperative call into the renderer. The engine defines two port interfaces;
a renderer implements both and registers them via `engine.setMapActions(impl)`
during `mount()`. `MapActions` is the intersection type the renderer registers.

```ts
interface DrawMapActions {
  removeFeatureFromMap: (id: string) => void;
  setFeatureVisibility: (id: string, visible: boolean, geojson: GeoJSON.Feature) => void;
  updateFeatureGeometry: (id: string, geojson: GeoJSON.Feature) => void;
}

interface ResultLayerActions {
  addResultLayer: (runId: string, envelope: MapLayerEnvelope) => void;
  removeResultLayer: (runId: string) => void;
}

type MapActions = DrawMapActions & ResultLayerActions;
```

`DrawMapActions` mirrors drawn-feature mutations (visibility, geometry swaps).
`ResultLayerActions` mirrors post-run result layers — the renderer narrows
the `MapLayerEnvelope` union (`geojson` / `tiles` / `image`) into native
maplibre source+layer pairs. The engine passes the `unknown` `RunResult`
through; the renderer interprets the envelope, so the engine never learns
domain-specific result shapes. If no renderer is attached, the calls are
skipped — headless operation (Node, worker) works without one.

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
}

type ModelAction =
  | { type: 'SET_MODEL'; payload: string }      // resets params to defaults
  | { type: 'SET_PARAM'; payload: { key: string; value: number } }
  | { type: 'SET_PARAMS'; payload: ModelParams };

function modelReducer(state: ModelState, action: ModelAction): ModelState;
```

`SET_MODEL` reads the registry's `defaultParamsFor(model)` so switching
models always starts from the model's own defaults (never inherits the
previous model's numbers).

### `runSlice`

[`packages/core/src/state/runSlice.ts`](https://github.com/anomalyco/catshark-engine/tree/main/packages/core/src/state/runSlice.ts)

Owns the run pipeline: the in-flight or most-recently-finished run (`current`)
plus an **unbounded** history of past runs (the user clears them explicitly
via `CLEAR_RESULT` / `CLEAR_ALL_RESULTS`). Run records store the opaque
`RunResult` raw — the engine never inspects it; the renderer's
`ResultLayerActions` narrows the `MapLayerEnvelope` inside.

```ts
type RunStatus =
  | 'idle' | 'preprocessing' | 'submitting' | 'running'
  | 'succeeded' | 'failed' | 'cancelled';

interface RunRecord {
  runId: string;
  modelId: string;
  params: ModelParams;
  status: RunStatus;
  result: RunResult | null;     // opaque result from ComputeProvider.submit
  error: string | null;
  progress: RunProgress | null;
  startedAt: number;
  finishedAt: number | null;
  visible: boolean;             // toggled by showResult/hideResult
}

type RunAction =
  | { type: 'RUN_REQUEST'; runId: string; modelId: string; params: ModelParams; startedAt: number }
  | { type: 'PREPROCESS_START' }
  | { type: 'SUBMIT_START' }
  | { type: 'PROGRESS'; payload: RunProgress }
  | { type: 'RUN_SUCCEED'; result: RunResult; finishedAt: number }
  | { type: 'RUN_FAIL'; error: string; finishedAt: number }
  | { type: 'RUN_CANCEL'; finishedAt: number }
  | { type: 'SHOW_RESULT'; runId: string }
  | { type: 'HIDE_RESULT'; runId: string }
  | { type: 'CLEAR_RESULT'; runId: string }
  | { type: 'CLEAR_ALL_RESULTS' };

function runReducer(state: RunState, action: RunAction): RunState;
function toSummary(rec: RunRecord): RunSummary;     // drops `result` payload
function allSummaries(state: RunState): RunSummary[];
```

Status transitions: `RUN_REQUEST` → `idle`; `PREPROCESS_START` →
`preprocessing`; `SUBMIT_START` → `submitting`; `PROGRESS` with
`step==='stream'` → `running` (other steps keep the current status);
terminal actions flip to `succeeded` / `failed` / `cancelled`. Starting a
new run pushes any **finished** `current` into `history` (in-flight ones are
aborted by the orchestrator first and not retained).

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

// Compute providers (registered per engine instance)
const noopComputeProvider: ComputeProvider;
function ensureDefaultComputeProviders(providers: Map<string, ComputeProvider>): void;
```

`ModelDef` is pure schema only (id, name, params) — the act of computing is
owned by a `ComputeProvider` registered separately via
`engine.registerComputeProvider(modelId, provider)`. The engine pre-registers
a `noopComputeProvider` for `hello-world` so the pipeline can be exercised
end-to-end with no backend (delayed 50 ms, returns an empty GeoJSON envelope).

A `ComputeProvider` exposes two cancelable methods:

```ts
interface ComputeProvider {
  preprocess(ctx: PreprocessContext, signal: AbortSignal): PreprocessResult | Promise<PreprocessResult>;
  submit(ctx: SubmitContext, signal: AbortSignal): Promise<RunResult>;
}
```

`preprocess` runs browser-side (simplify, reproject, validate, build payload);
`submit` performs the expensive backend roundtrip / streaming compute and
may call `ctx.onProgress` with a `RunProgress` event. Both receive the
engine's `AbortSignal` so cancellation is observable. Providers honouring
abort prevent stale responses from polluting state.

Replace `helloWorldModel` / `noopComputeProvider` with real models by calling
`registerModel` + `engine.registerComputeProvider` from your app's bootstrap
(typically alongside `@catshark/client` wiring).

### Run pipeline orchestration

`SimulationEngine.run()` owns the async orchestration:

1. If a run is in flight, `cancelRun()` is called and the prior promise is awaited.
2. A new `AbortController` + `runId` are minted; `RUN_REQUEST` replaces `current`.
3. `PREPROCESS_START` → `provider.preprocess()`. Aborts short-circuit.
4. `SUBMIT_START` → `provider.submit()`; progress events dispatch `PROGRESS`.
5. On resolve: `RUN_SUCCEED` (status: `succeeded`, stores the result).
6. On abort: `RUN_CANCEL` (status: `cancelled`).
7. On other reject: `RUN_FAIL` (status: `failed`, stores `error.message`).
8. `run()` resolves when the run has finished; callers do not need to await —
   `useRun` never does, it only observes state.

Single in-flight contract: only one `AbortController` is held at a time, and
the engine guards terminal dispatches by `this._abort === ac` so a stale
aborted run's terminal never overwrites a newer run's state.

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

Use these inside a `ComputeProvider.preprocess` for spatial queries ("is
this observation point inside the study polygon?") without touching the
canvas or any network.

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