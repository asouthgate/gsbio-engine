# `@catshark/react`

The thin React adapter. **Zero simulation logic, zero rendering-backend
knowledge.** This package maps the engine's `EngineState` into React's
reactive system and hosts a renderer-agnostic `<Canvas>`.

Everything exported here is a hook or a thin presentational component. The
package `peerDepends` on `react` / `react-dom` and `@catshark/core`; it
deliberately has no dependency on `maplibre-gl`, `terra-draw`, or any
WebGPU library.

## Providers

### `EngineProvider`

[`packages/react/src/useEngine.tsx`](https://github.com/anomalyco/catshark-engine/tree/main/packages/react/src/useEngine.tsx)

Creates (or accepts) a `SimulationEngine` and put it in context. Every
hook below reads from here.

```tsx
<EngineProvider engine={injectedEngineOptional}>
  <App />
</EngineProvider>
```

### `AppProvider`

[`packages/react/src/AppProvider.tsx`](https://github.com/anomalyco/catshark-engine/tree/main/packages/react/src/AppProvider.tsx)

Composite provider. Wraps `EngineProvider` + `DataSourceProvider`.

```tsx
<AppProvider>
  <App />
</AppProvider>
```

### `DataSourceProvider`

[`packages/react/src/providers/DataSourceProvider.tsx`](https://github.com/anomalyco/catshark-engine/tree/main/packages/react/src/providers/DataSourceProvider.tsx)

Derives the built-in `drawn-features` `DataSourceDef` from engine draw
state and surfaces the combined list. Exposed via `useDataSources()`.

## Hooks

| Hook | Returns | Notes |
| --- | --- | --- |
| `useEngine()` | `SimulationEngine` | throws outside `<EngineProvider>` |
| `useEngineState()` | `EngineState` | subscribes via `useSyncExternalStore` |
| `useDraw()` | `{ state, dispatch, startDrawing, selectMode, removeFeature, toggleVisibility }` | wraps `engine.dispatchDraw` |
| `useModel()` | `{ state, dispatch, run }` | `run(features)` calls the core `runModel()` |
| `useDataSources()` | `{ sources, drawnSource }` | derived list of `DataSourceDef`s |

### External store, not `useReducer`

The original `DrawContext` / `ModelContext` used `useReducer` per provider,
meaning each provider owned its own copy of state. After the refactor the
**engine** owns state; React just **reads** it. `useEngineState` does this
with `useSyncExternalStore(engine.subscribe, engine.getSnapshot)` — the
same React 18+ API designed for this exact pattern.

Benefits:

- the engine and React share one source of truth (not two that mirror each
  other),
- the engine can run outside React (worker, Node test) with the same state
  shape,
- Strict Mode double-mounts are safe because `subscribe` returns a stable
  unsubscribe.

### `useModel().run`

```ts
run: (features: ReadonlyArray<DrawnFeature>) =>
  runModel(engine, features);
```

A one-line call into `core`'s `runModel`, which dispatches `RUN_START`,
invokes the model's `run`, and dispatches `RUN_FINISH` in a `finally`. The
React hook does not duplicate that orchestration.

## `<Canvas>`

[`packages/react/src/Canvas.tsx`](https://github.com/anomalyco/catshark-engine/tree/main/packages/react/src/Canvas.tsx)

The renderer-agnostic view host. Owns a container `<div>` and asks the
supplied `Renderer` plugin to mount/unmount against the current engine:

```tsx
<Canvas
  renderer={terraDraw2DRenderer({ style, center, zoom })}
  className="map-view"
>
  <DrawToolbar />        {/* overlay rendered above the canvas surface */}
</Canvas>
```

Implementation outline:

```tsx
function Canvas({ renderer, className, children }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const engine = useEngine();
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    void Promise.resolve(renderer.mount(container, engine)).then(() => {
      if (cancelled) void renderer.unmount();
    });
    return () => {
      cancelled = true;
      void renderer.unmount();
    };
  }, [renderer, engine]);
  return (
    <div className={className} style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={containerRef} style={{ position: 'absolute', inset: 0 }} />
      {children}
    </div>
  );
}
```

Key invariants:

- `Canvas` knows **nothing** about maplibre, WebGL, or WebGPU. It only sees
  the `Renderer` port interface.
- A React 19 Strict Mode double-mount will call `mount` then `unmount` then
  `mount` again; the `cancelled` flag prevents the first mount's async
  cleanup from racing the second mount.
- The host element is `position: relative` so children (toolbars,
  attribution overlays) can be absolutely positioned by the consumer.

## What's deliberately **not** in `@catshark/react`

- Map / canvas instantiation. Lives in renderer plugins.
- Tile URL strings. Live in `@catshark/client`.
- Model execution. Lives in `@catshark/core`'s `runModel`.
- State reducers. Live in `@catshark/core` slices.

If a future React hook here grows past "map state to React" it's a signal
that logic belongs in `core`. Presentational components that project engine
state into the canonical draw → configure → run workflow live in a sibling
package, [`@catshark/react-ui`](./react-ui.md), so this package stays strictly
hooks-and-host while the presentational layer still ships with the engine
rather than being re-implemented per app.