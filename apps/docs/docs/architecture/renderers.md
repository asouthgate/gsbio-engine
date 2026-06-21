# Renderers

Renderers plug a rendering backend (MapLibre, WebGL, WebGPU) into the
renderer-agnostic `<Canvas>` host. Each renderer is a package that:

1. depends on `@catshark/core` for types and (optionally) the
   `SimulationEngine` class,
2. implements the [`Renderer`](./core.md#renderer-port) port,
3. consumes the engine's public state tree via `engine.subscribe()` /
   `engine.getSnapshot()`,
4. calls back into the engine via `engine.dispatchDraw(...)` when the user
   interacts with the canvas (draw, edit, select),
5. registers an imperative [`DrawMapActions`](./core.md#imperative-bridge)
   bridge so the engine can move geometry on the canvas without React being
   involved.

## The contract

[`packages/core/src/types.ts`](https://github.com/anomalyco/catshark-engine/tree/main/packages/core/src/types.ts)

```ts
interface Renderer {
  mount(container: HTMLElement, engine: unknown): void | Promise<void>;
  unmount(): void | Promise<void>;
}

interface DrawMapActions {
  removeFeatureFromMap: (id: string) => void;
  setFeatureVisibility: (id: string, visible: boolean, geojson: GeoJSON.Feature) => void;
}
```

The engine → renderer direction uses `DrawMapActions` (the engine calls
these to mutate the canvas). The renderer → engine direction uses
`engine.dispatchDraw(...)` (the renderer reports user input back). Both
directions are explicit, both go through the engine — neither side reads
the other's internals.

## `@catshark/renderer-2d`

[`packages/renderer-2d/src/TerraDraw2DRenderer.ts`](https://github.com/anomalyco/catshark-engine/tree/main/packages/renderer-2d/src/TerraDraw2DRenderer.ts)

The MapLibre + TerraDraw renderer. Packaged as a class implementing the
`Renderer` port:

```ts
class TerraDraw2DRenderer implements Renderer {
  constructor(options: TerraDraw2DOptions);
  mount(container: HTMLElement, engine: SimulationEngine): Promise<void>;
  unmount(): void;
}

interface TerraDraw2DOptions {
  style: maplibregl.StyleSpecification;  // from @catshark/client (e.g. OSM_RASTER_STYLE)
  center?: [number, number];
  zoom?: number;
}

function createTerraDraw2DRenderer(options: TerraDraw2DOptions): TerraDraw2DRenderer;
```

### Mount lifecycle

1. Create a `maplibregl.Map` in the host container with the supplied style.
2. Wait for `map.on('load')`.
3. Construct a `TerraDraw` instance with select / point / linestring /
   polygon modes and the MapLibreGL adapter.
4. Call `engine.setMapActions(...)` with the imperative bridge:
   - `removeFeatureFromMap` → `draw.removeFeatures([id])`
   - `setFeatureVisibility` → `draw.removeFeatures` / `draw.addFeatures`
5. Subscribe to the engine so the renderer reflects engine draw-mode changes
   back into TerraDraw (`draw.setMode(mode)`).
6. Wire TerraDraw events back to the engine:
   - `draw.on('finish', id)` — dispatch `ADD_FEATURE` (new) or
     `UPDATE_FEATURE` (existing), then `SET_DRAW_MODE` back to `select`.
   - `draw.on('change', ids)` — dispatch `UPDATE_FEATURE` with the new
     geometry.

### Unmount

Unsubscribes from the engine, stops TerraDraw, and calls `map.remove()`.
Wrapped in `try/catch` so React Strict Mode's double-invoked cleanup never
throws into the host.

### Strict Mode

React 19 will mount → unmount → mount a component in development. The host
`<Canvas>` cancels the first mount's async resolution via a `cancelled`
flag, and the renderer's own cleanup is defensive; the second mount
constructs a fresh `maplibregl.Map` and `TerraDraw` instance.

## `@catshark/renderer-3d`

[`packages/renderer-3d/src/WebGPU3DRenderer.ts`](https://github.com/anomalyco/catshark-engine/tree/main/packages/renderer-3d/src/WebGPU3DRenderer.ts)

A stub scaffold. Implements the `Renderer` port so it can already be hosted
by `<Canvas>`:

```ts
class WebGPU3DRenderer implements Renderer {
  constructor(options?: WebGPU3DOptions);
  mount(container: HTMLElement, engine: unknown): Promise<void>;   // rejects: not implemented
  unmount(): void;                                                   // no-op
}
```

`mount()` returns a rejected promise — the demo app uses this to verify
its error handling without crashing the layout. A real implementation will
replace the body: allocate a WebGPU device, build a render pipeline,
subscribe to engine draw state, render features as 3D geometry.

## Why renderers are separate packages

- **Pay for what you use.** A consumer doing only 2D analysis doesn't
  install WebGL/WGPU code (and the WASM/transpiler toolchain it implies).
- **Renderer choice is a runtime concern, not a compile-time one.** Swap
  `TerraDraw2DRenderer` for `WebGPU3DRenderer` in the `<Canvas>`
  `renderer` prop without touching anything else.
- **Boundaries are enforced by dependencies.** `@catshark/renderer-2d`
  depends on `@catshark/core` and `terra-draw`; `@catshark/renderer-3d`
  will eventually depend on `@webgpu/types`. Neither imports from
  `@catshark/react` — they only implement the port `react` consumes.