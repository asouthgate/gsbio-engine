# Catshark Engine

An open-source engine for biological spatial modelling on maps (or other manifolds).

## Implementing a model

A *model* is a named, parameterised computation that turns drawn map features into result layers the engine can render on the map. There are two main parts:

- a **schema** (`ModelDef`) — the model's id, name, and parameter list.
- an **executor** (`Executor`) — the code that runs the computation and returns result layers as **envelopes** (see §3). It is bound to a model by id at registration time, and a single `Executor` implementation may in principle serve more than one model.

To use the engine you generally implement four things (see the `radialSpread` example `apps/demo-web/src/models/radialSpread.ts`):

### 1. `ModelDef`

Firstly, declare the model and its params. This model is a trivial one that has only the `resolution` parameter.

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

### 2. `Executor`

An `Executor` has two required methods, `preprocess` and `submit`. `preprocess` runs browser-side (filter/reproject/validate features, may emit `warnings`). `submit` does the work, e.g. submission to a compute API, direct calculation in-browser, or something else. The executor returns layers (see `ResultLayerEntry`) The executor should honour the forwarded `AbortSignal` and can call `ctx.onProgress` for progress updates.

```ts
// apps/demo-web/src/models/radialSpread.ts:159-181
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
    // Simulated streaming compute; emit a progress tick per step.
    for (let i = 1; i <= SUBMIT_STEPS; i++) {
      await delay(SUBMIT_STEP_MS, signal);
      ctx.onProgress?.({ step: 'submit', fraction: i / SUBMIT_STEPS, label: `step ${i}/${SUBMIT_STEPS}` });
    }
    return rasterizeZones(payload); // returns { layers: ResultLayerEntry[], summary }
  },
};
```

### 3. `MapLayerEnvelope` — the structured return type for results

An executor doesn't return arbitrary results. It must return `ResultLayerEntry` wrappers which store `MapLayerEnvelope`. There are three kinds — a GeoJSON feature collection carried inline, a URL pointing at a tile service, or a URL pointing at a georeferenced image plus the lng/lat bounds that pin it to the globe (`packages/core/src/types.ts:265-268`). 

Inside `submit`, for each result layer you want to show, pick a `kind` and construct one envelope:

```ts
// apps/demo-web/src/models/radialSpread.ts:107-150 (pixel loop elided)
function rasterForZone(ctx, z, N): MapLayerEnvelope {
  // …write RGBA into ctx.canvas…
  const url = (ctx.canvas as HTMLCanvasElement).toDataURL('image/png');
  const dLat = z.radiusMeters / 111_320;
  const dLng = z.radiusMeters / (111_320 * Math.cos((z.center.lat * Math.PI) / 180));
  const bounds: [number, number, number, number] = [
    z.center.lng - dLng, z.center.lat - dLat, z.center.lng + dLng, z.center.lat + dLat,
  ];
  return { kind: 'image', url, bounds }; // ← executor builds the envelope here
}
```

### 4. Putting it together

Instantiate the engine and install the model.

```tsx
// apps/demo-web/src/main.tsx:13-14
const engine = createSimulationEngine();
registerModel(radialSpreadModel);
engine.registerExecutor(radialSpreadModel.id, radialSpreadExecutor);
engine.dispatchModel({ type: 'SET_MODEL', payload: radialSpreadModel.id });
```

Finally mount the engine via `<AppProvider>` and pass a renderer to `MapScene`/`Canvas` — the shipped `@catshark/renderer-2d` covers 2D:

```tsx
const renderer = useMemo<TerraDraw2DRenderer>(
  () => createTerraDraw2DRenderer({
    style: OSM_RASTER_STYLE as never, center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM,
  }), [],
);
return <MapScene renderer={renderer}>…</MapScene>;
```