# gsbio Engine

An open-source engine for biological spatial modelling on maps (or other manifolds).

## Implementing a model

A *model* is a named, parameterised computation that turns drawn map features into result layers the engine can render on the map. There are two main parts:

- a **schema** (`ModelDef`) — the model's id, name, and parameter list.
- an **executor** (`Executor`) — the code that runs the computation and returns result layers as **envelopes** (see §3). It is bound to a model by id at registration time, and a single `Executor` implementation can serve more than one model.

To use the engine you implement four things. The demo app ships two runnable examples over the same radial-spread biology, one per executor archetype:

- **archetype A — WASM compute** (`radialSpread`): a compiled `.wasm` kernel fills a distance-shaded raster in `submit`; the executor emits one `image` envelope per drawn circle. Returns `image` envelopes.
- **archetype B — fetch from a backend API** (`radialSpreadApi`): POST drawn circles to a mock backend, poll for completion, and wrap the returned tile-URL template in a `tiles` envelope. The mock backend shades XYZ tiles with the *same* warm ramp as the WASM archetype, so the two differ only in compute path. Returns a `tiles` envelope.

Each model's source is split across its folder so the separation is explicit:

- `model.ts` — the `ModelDef` schema only.
- `executor.ts` — the `Executor` (`preprocess` + `submit`) and the one-call `install*` helper.
- model-specific compute files — the raw rasteriser/math (e.g. `rasterize.ts` for the WASM glue, `tileShade.ts` for the API tile shader).
- `../shared.ts` — circle helpers shared by both archetypes (`selectSpreadZones`, `circleBounds`), so the common biology lives once.

### 1. `ModelDef`

Declare the model id, name, description, and params. `radialSpread` has one range param:

```ts
// apps/demo-web/src/models/radialSpread/model.ts
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

#### Archetype A: WASM compute (`radialSpread`)

`submit` invokes a compiled `.wasm` kernel to fill a distance-shaded raster, then emits one `image` envelope per drawn circle. The raster is a centred distance field, identical for every circle, so the kernel runs once and the resulting data URL is reused — only each circle's geo `bounds` differ.

```ts
// apps/demo-web/src/models/radialSpread/executor.ts
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
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const { zones, resolution } = ctx.payload as RadialSpreadPayload;
    if (zones.length === 0) return { layers: [], summary: { count: 0, zoneIds: [] } };
    const url = renderRadialRaster(resolution);   // wasm kernel → PNG data URL (once)
    const layers = zones.map((z) => ({
      id: z.id,
      envelope: { kind: 'image', url, bounds: circleBounds(z) },
    }));
    ctx.onProgress?.({ step: 'submit', fraction: 1, label: 'rasterised' });
    return { layers, summary: { count: layers.length, zoneIds: zones.map((z) => z.id) } };
  },
};
```

The wasm glue (`apps/demo-web/src/models/radialSpread/rasterize.ts`) instantiates the kernel, reads the `Uint8Array` view back through `memory` + `dataStart()`, and bakes it onto a canvas:

```ts
// apps/demo-web/src/models/radialSpread/rasterize.ts
import { setup as wasmSetup, fillRadial as wasmFillRadial,
  dataStart as wasmDataStart, memory as wasmMemory } from '../../wasm/spread.wasm';
export function renderRadialRaster(n: number): string {
  wasmSetup(n);
  wasmFillRadial(n);                                          // ← synchronous main-thread call
  const bytes = new Uint8Array(wasmMemory.buffer, wasmDataStart(), n * n * 4);
  const imageData = new ImageData(new Uint8ClampedArray(bytes), n, n);
  const canvas = document.createElement('canvas');
  canvas.width = n; canvas.height = n;
  canvas.getContext('2d')!.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}
```

The AssemblyScript source for the kernel lives at `apps/demo-web/src/wasm/spread.ts`; regenerate the binary with `pnpm --filter @gsbio/demo-web build:wasm`.

#### Archetype B: fetch from a backend API (`radialSpreadApi`)

`submit` POSTs the drawn circles to a backend, polls, then wraps the returned tile-URL template in a `tiles` envelope. The demo includes a Vite middleware plugin (`apps/demo-web/src/mock/fakeApi.ts`) that simulates the API.

```ts
// apps/demo-web/src/models/radialSpreadApi/executor.ts
async submit(ctx, signal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
  const { zones } = ctx.payload as RadialSpreadApiPayload;
  if (zones.length === 0) return { layers: [], summary: { count: 0, zoneIds: [] } };
  const createRes = await fetch('/api/spread/run', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ zones }),
    signal,                                                       // ← threaded in: cancel kills the request
  });
  const { runId } = await createRes.json();
  const onAbort = () => fetch(`/api/spread/run/${runId}/cancel`, { method: 'POST' }).catch(() => {});
  signal.addEventListener('abort', onAbort, { once: true });
  try {
    let poll: PollResult = { status: 'pending', progress: 0 };
    for (;;) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
      await delay(250, signal);
      const res = await fetch(`/api/spread/run/${runId}`, { signal });
      poll = await res.json() as PollResult;
      ctx.onProgress?.({ step: 'submit', fraction: poll.progress, label: `${Math.round(poll.progress*100)}%` });
      if (poll.status === 'completed' || poll.status === 'cancelled') break;
    }
    const envelope: MapLayerEnvelope = { kind: 'tiles', url: poll.tilesUrl!, type: 'raster' };
    return { layers: [{ id: 'radial-spread-api', envelope }],
             summary: { count: zones.length, zoneIds: zones.map((z) => z.id), runId } };
  } finally { signal.removeEventListener('abort', onAbort); }
},
```

The mock backend shades each XYZ tile on demand via `apps/demo-web/src/models/radialSpreadApi/tileShade.ts`, using the same distance-decay warm ramp as the WASM kernel — so the two archetypes are visually identical and differ only in compute path.

### 3. `MapLayerEnvelope`: the structured return type for results

An executor returns one or more `ResultLayerEntry`s; each carries a `MapLayerEnvelope`. The envelope is a closed union over `kind`. The dev picks a kind per result layer and the renderer narrows on it (`packages/renderer-2d/src/TerraDraw2DRenderer.ts:170-234`):

```ts
// packages/core/src/types.ts:314-317
export type MapLayerEnvelope =
  | { kind: 'geojson'; data: GeoJSON.FeatureCollection }
  | { kind: 'tiles'; url: string; sourceLayer?: string; type: 'raster' | 'vector' }
  | { kind: 'image'; url: string; bounds: [number, number, number, number] };
```

```ts
// apps/demo-web/src/models/shared.ts (the bounds helper both archetypes share)
export function circleBounds(z: Zone): [number, number, number, number] {
  const dLat = z.radiusMeters / 111_320;
  const dLng = z.radiusMeters / (111_320 * Math.cos((z.center.lat * Math.PI) / 180));
  return [z.center.lng - dLng, z.center.lat - dLat, z.center.lng + dLng, z.center.lat + dLat];
}
```

### 4. Putting it together

Instantiate the engine, install each model + its executor, then hand the engine to `<AppProvider>`. Models are listed in the Model dropdown for free (`ModelForm` reads `listModels()` from `@gsbio/core`); pick one, draw its expected feature categories, and click **Run model**:

```tsx
// apps/demo-web/src/main.tsx
const engine = createSimulationEngine();
installRadialSpread(engine);
installRadialSpreadApi(engine);
```

Each `install*` helper is the same three-line pattern (register model, register executor, optionally select):

```tsx
// apps/demo-web/src/models/radialSpread/executor.ts
export function installRadialSpread(engine: SimulationEngine): void {
  engine.registerModel(radialSpreadModel);
  engine.registerExecutor(radialSpreadModel.id, radialSpreadExecutor);
  engine.dispatchModel({ type: 'SET_MODEL', payload: radialSpreadModel.id });
}
```

`installRadialSpreadApi` skips the `dispatchModel` line so the demo opens with the WASM archetype selected by default; the user switches models via the Model dropdown.

```tsx
// apps/demo-web/src/components/MapView.tsx:13-21
const renderer = useMemo<TerraDraw2DRenderer>(
  () => createTerraDraw2DRenderer({
    style: OSM_RASTER_STYLE as never, center: DEFAULT_CENTER, zoom: DEFAULT_ZOOM,
  }), [],
);
return <MapScene renderer={renderer}>…</MapScene>;
```