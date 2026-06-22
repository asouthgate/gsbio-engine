# Catshark Engine

An open-source headless engine for biological spatial modelling on maps (or other manifolds).

## Implementing a model

**What is a model?** A *model* is a named, parameterised computation that turns drawn map features into result layers you can toggle on the map. It has two parts that live separately:

- a **schema** (`ModelDef`) — the model's id, name, and parameter list. Pure data, no behaviour.
- an **executor** (`Executor`) — the code that actually runs the computation. It is *not* part of the model: it is bound to a model by id at registration time, and a single `Executor` implementation may in principle serve more than one model.

A bundled `hello-world` model and `noopExecutor` auto-register on engine construction (`packages/core/src/engine.ts:78-81`), so you can boot before writing your own. To ship a non-bundled model you implement four things; snippets below are trimmed from the demo app at `apps/demo-web/src/models/radialSpread.ts`.

### 1. `ModelDef` — declare the model and its params

```ts
// apps/demo-web/src/models/radialSpread.ts:21-39
export const radialSpreadModel: ModelDef = {
  id: 'radial-spread',
  name: 'Radial Spread',
  description: '…',
  params: [
    { key: 'resolution', label: 'Raster resolution (px)', type: 'range',
      min: 16, max: 128, step: 8, default: 64 },
  ],
};
```

### 2. `Executor` — execute the model's computation

An `Executor` has **two required methods**, `preprocess` and `submit`. Without an executor bound to a model id, `engine.run()` throws for that model (`packages/core/src/engine.ts:169-172`). `preprocess` runs browser-side (filter/reproject/validate features, may emit `warnings`); `submit` does the expensive work and returns one of three `RunResult` shapes (`packages/core/src/types.ts:127-200`). Honour the forwarded `AbortSignal`; call `ctx.onProgress` for progress updates.

```ts
// apps/demo-web/src/models/radialSpread.ts:144-164
export const radialSpreadExecutor: Executor = {
  async preprocess(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const zones = selectSpreadZones(ctx.features);
    const warnings: string[] = [];
    if (zones.length === 0) warnings.push('No Spread_zone circles drawn — …');
    const resolution = ctx.params.resolution ?? radialSpreadModel.params[0]!.default;
    return { payload: { zones, resolution }, warnings };
  },
  async submit(ctx, signal) {
    const payload = ctx.payload as RadialSpreadPayload;
    return stubExecutor.run({ payload, onProgress: ctx.onProgress, signal }, rasterizeZones);
  },
};
```

### 3. `MapLayerEnvelope` — describe one result layer to the renderer

A `MapLayerEnvelope` is a descriptor telling the renderer how to draw **one** layer onto the map. Think of it as a labelled envelope posted to the renderer: inside is either inline vector data (GeoJSON), a URL pointing at a tile service, or a URL pointing at a georeferenced image plus the lng/lat bounds that pin it to the globe. The envelope is the *carrier*, not the pixels — for the `tiles` and `image` kinds the renderer fetches the bytes from `url` itself. It is a closed union (`packages/core/src/types.ts:265-268`); the renderer narrows via the `kind` field and the engine stays oblivious to its shape.

```ts
// apps/demo-web/src/models/radialSpread.ts:95-128 (pixel loop elided)
function rasterForZone(ctx, z, N): MapLayerEnvelope {
  // …write RGBA into ctx.canvas…
  const url = (ctx.canvas as HTMLCanvasElement).toDataURL('image/png');
  const dLat = z.radiusMeters / 111_320;
  const dLng = z.radiusMeters / (111_320 * Math.cos((z.center.lat * Math.PI) / 180));
  const bounds: [number, number, number, number] = [
    z.center.lng - dLng, z.center.lat - dLat, z.center.lng + dLng, z.center.lat + dLat,
  ];
  return { kind: 'image', url, bounds };
}
```

A run can yield 0..N such layers. Each is wrapped in a `ResultLayerEntry` (a stable `id` + its envelope), and the executor returns them as `{ layers: ResultLayerEntry[], summary? }` (`radialSpread.ts:72-91`).

### 4. Bootstrap — wire the engine and mount

```tsx
// apps/demo-web/src/main.tsx:13-14
const engine = createSimulationEngine();
installRadialSpread(engine);
```

A one-call installer is the recommended convention — register the model, bind its executor by id, then select the model:

```ts
// apps/demo-web/src/models/radialSpread.ts:167-170
export function installRadialSpread(engine: SimulationEngine): void {
  registerModel(radialSpreadModel);
  engine.registerExecutor(radialSpreadModel.id, radialSpreadExecutor);
  engine.dispatchModel({ type: 'SET_MODEL', payload: radialSpreadModel.id });
}
```

Finally mount the engine via `<AppProvider>` and pass a renderer to `MapScene`/`Canvas` — the shipped `@catshark/renderer-2d` covers 2D:

```tsx
// apps/demo-web/src/components/MapView.tsx:13-24
const renderer = useMemo<TerraDraw2DRenderer>(
  () => createTerraDraw2DRenderer({
    style: OSM_RASTER_STYLE as never, center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM,
  }), [],
);
return <MapScene renderer={renderer}>…</MapScene>;
```