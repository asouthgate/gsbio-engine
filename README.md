# gsbio Engine

An open-source engine for biological spatial modelling on maps (or other manifolds).

## Implementing a model

A *model* is a named, parameterised computation that turns drawn map features into result layers the engine can render on the map. There are two main parts:

- a **schema** (`ModelDef`) — the model's id, name, and parameter list.
- an **executor** (`Executor`) — the code that runs the computation and returns result layers as **envelopes** (see §3). It is bound to a model by id at registration time, and a single `Executor` implementation can serve more than one model.

To use the engine you implement four things. The demo app ships three runnable examples, one per executor example:

- **example A — main-thread compute** (`radialSpread`): computes a raster directly in `submit` with a `<canvas>`. Returns `image` envelope.
- **example B — WASM compute** (`forageCost`): use a compiled `.wasm` module in `submit` to compute raster. Returns an `image` envelope.
- **example C — fetch from a backend API** (`corridorConnect`): POST drawn features to a server, poll for completion, and wrap the returned tile-URL template in a `tiles` envelope. Returns `tiles` envelope.

### 1. `ModelDef`

Declare the model id, name, description, and params. `radialSpread` has one range param:

```ts
// apps/demo-web/src/models/radialSpread/model.ts:21-37
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

An `Executor` has two required methods, `preprocess` and `submit`. `preprocess` runs browser-side (filter/reproject/validate features); `submit` does e.g. a backend call, WASM call, or in-canvas calculation — and returns one or more result layers (`ResultLayerEntry[]`). Both methods must honour the supplied `AbortSignal`; `ctx.onProgress` lets `submit` increase the UI progress indicator, and `ctx.onLog(level, message)` appends to the run log. `<ResultsPanel>` renders inline warnings and a click-to-expand full log.

#### Example A: main-thread compute (`radialSpread`)

```ts
export const radialSpreadExecutor: Executor = {
  async preprocess(ctx, signal) {
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const zones = selectSpreadZones(ctx.features);
    if (zones.length === 0) {
      ctx.onLog?.('warning', 'No Spread_zone circles drawn — submit will produce zero result layers.');
    }
    const resolution = ctx.params.resolution ?? radialSpreadModel.params[0]!.default;
    return { payload: { zones, resolution } };
  },
  async submit(ctx, signal) {
    const payload = ctx.payload as RadialSpreadPayload;
    for (let i = 1; i <= SUBMIT_STEPS; i++) {
      await delay(SUBMIT_STEP_MS, signal); // demo helper, see apps/demo-web/src/shared/delay.ts
      ctx.onProgress?.({ step: 'submit', fraction: i / SUBMIT_STEPS, label: `step ${i}/${SUBMIT_STEPS}` });
    }
    return rasterizeZones(payload.zones, payload.resolution); // { layers, summary }
  },
};
```

#### Example B — WASM compute (`forageCost`)

`submit` instantiates a compiled `.wasm` module, calls its exported kernel functions, reads the resulting `Float32Array` view from the wasm `memory.buffer`, and returns an `image` envelope.

```ts
// apps/demo-web/src/models/forageCost/model.ts (elided); see file for full submit body
// Named wasm exports; the plugin's top-level await resolves before submit runs:
import {
  setup as wasmSetup, markSource as wasmMarkSource, markBarrier as wasmMarkBarrier,
  relax as wasmRelax, dataStart as wasmDataStart, memory as wasmMemory,
} from '../../wasm/costmap.wasm';
// …
if (p.sources.length === 0) {
  ctx.onLog?.('warning', 'No Source points — produced zero result layers.');
  return { layers: [], summary: { sourceCount: 0 } };
}
ctx.onLog?.('info', `Marking ${p.sources.length} source(s) and ${p.barrierCells.length} barrier cell(s).`);
wasmSetup(rows, cols);
for (const s of p.sources)       wasmMarkSource(rowOf(s.lat),  colOf(s.lng),  cols);
for (const b of p.barrierCells)  wasmMarkBarrier(rowOf(b.lat), colOf(b.lng), cols);
const CHUNKS = 8, perChunk = Math.max(1, Math.ceil(iters / CHUNKS));
for (let i = 0; i < CHUNKS && doneIters < iters; i++) {
  wasmRelax(rows, cols, Math.min(perChunk, iters - doneIters));  // ← synchronous main-thread call
  doneIters += perChunk;
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  ctx.onProgress?.({ step: 'submit', fraction: doneIters / iters, label: `relaxation ${i+1}/${CHUNKS}` });
}
const cost = new Float32Array(wasmMemory.buffer, wasmDataStart(), rows * cols);   // read back kernel output
const imageData = costToImageData(cost, rows, cols);   // colour-map: green=cheap → red=expensive, NaN=transparent
canvasCtx.putImageData(imageData, 0, 0);
const url = canvas.toDataURL('image/png');
const envelope: MapLayerEnvelope = { kind: 'image', url, bounds: [bounds.minLng, bounds.minLat, bounds.maxLng, bounds.maxLat] };
return { layers: [{ id: 'forage-cost', envelope}], summary: { sourceCount: p.sources.length } };
```

#### Example C: fetch from a backend API (`corridorConnect`)

`submit` POSTs the drawn features to a backend, polls, then wraps the returned tile-URL template in a `tiles` envelope. The demo includes a Vite middleware plugin (`apps/demo-web/src/mock/fakeApi.ts`) that simulates the API.

```ts
// apps/demo-web/src/models/corridorConnect/model.ts:89-153
async submit(ctx, signal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const { patches } = ctx.payload as CorridorsPayload;
  if (patches.length < 2) return { layers: [], summary: { patchCount: patches.length, corridorCount: 0 } };
  const createRes = await fetch('/api/corridors/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patches }),
    signal,                                                       // ← threaded in: cancel kills the request
  });
  const { runId } = await createRes.json();
  const onAbort = () => fetch(`/api/corridors/run/${runId}/cancel`, { method: 'POST' }).catch(() => {});
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    let poll: PollResult = { status: 'pending', progress: 0 };
    for (;;) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await delay(250, signal);
      const res = await fetch(`/api/corridors/run/${runId}`, { signal });
      poll = await res.json() as PollResult;
      ctx.onProgress?.({ step: 'submit', fraction: poll.progress, label: `${Math.round(poll.progress*100)}%` });
      if (poll.status === 'completed' || poll.status === 'cancelled') break;
    }
    const envelope: MapLayerEnvelope = { kind: 'tiles', url: poll.tilesUrl!, type: 'raster' };
    return {
      layers: [{ id: 'corridors', envelope }],
      summary: { patchCount: patches.length, corridorCount: Array.isArray(poll.result) ? poll.result.length : 0, runId },
    };
  } finally { signal.removeEventListener('abort', onAbort); }
},
```

### 3. `MapLayerEnvelope`: the structured return type for results

An executor returns one or more `ResultLayerEntry`s; each carries a `MapLayerEnvelope`. The envelope is a closed union over `kind`. The dev picks a kind per result layer and the renderer narrows on it (`packages/renderer-2d/src/TerraDraw2DRenderer.ts:170-234`):

```ts
// packages/core/src/types.ts:285-288
export type MapLayerEnvelope =
  | { kind: 'geojson'; data: GeoJSON.FeatureCollection }
  | { kind: 'tiles'; url: string; sourceLayer?: string; type: 'raster' | 'vector' }
  | { kind: 'image'; url: string; bounds: [number, number, number, number] };
```

```ts
// apps/demo-web/src/models/radialSpread/rasterize.ts:22-61 (pixel loop elided)
export function rasterForZone(ctx, z, N): MapLayerEnvelope {
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

Instantiate the engine, install each model + its executor, then hand the engine to `<AppProvider>`. Models are listed in the Model dropdown for free (`ModelForm` reads `listModels()` from `@gsbio/core`); pick one, draw its expected feature categories, and click **Run model**:

```tsx
// apps/demo-web/src/main.tsx:16-19
const engine = createSimulationEngine();
installRadialSpread(engine);
installForageCost(engine);
installCorridorConnect(engine);
```

Each `install*` helper is the same four-line pattern (register model, register executor, optionally select):

```tsx
// apps/demo-web/src/models/radialSpread/model.ts:96-100
export function installRadialSpread(engine: SimulationEngine): void {
  engine.registerModel(radialSpreadModel);
  engine.registerExecutor(radialSpreadModel.id, radialSpreadExecutor);
  engine.dispatchModel({ type: 'SET_MODEL', payload: radialSpreadModel.id });
}
```
`forageCost` and `corridorConnect` skip the `dispatchModel` line so the demo opens with `radialSpread` selected by default; the user switches models via the Model dropdown.

```tsx
// apps/demo-web/src/components/MapView.tsx:13-21
const renderer = useMemo<TerraDraw2DRenderer>(
  () => createTerraDraw2DRenderer({
    style: OSM_RASTER_STYLE as never, center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM,
  }), [],
);
return <MapScene renderer={renderer}>…</MapScene>;
```