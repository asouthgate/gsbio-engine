/**
 * Catshark Engine — core types.
 *
 * Framework-agnostic. No React, no maplibre, no terra-draw here.
 * The engine defines the shape of models and data sources; adapters
 * (`@catshark/react`, `@catshark/renderer-2d`, `@catshark/client`) bind
 * these to UI/rendering/network.
 */

import type { LngLat } from './spatial';

export type GeometryKind = 'point' | 'linestring' | 'polygon' | 'circle';

/** Semantic circle: stored alongside the GeoJSON polygon approximation so the
 *  geometric truth (centre + radius) survives re-projection and edits. */
export interface CircleGeometry {
  center: LngLat;
  radiusMeters: number;
}

/** A single drawn/user feature, decoupled from any domain semantics. */
export interface DrawnFeature {
  id: string;
  /** Geometry kind, derived from the active draw mode at creation time. */
  geometryKind: GeometryKind;
  /** Free-text category label supplied by the user (e.g. "river", "nest"). */
  category: string;
  /** Human-readable label. */
  label: string;
  visible: boolean;
  geojson: GeoJSON.Feature;
  /** Present only when `geometryKind === 'circle'`. */
  circle?: CircleGeometry;
}

/* ----------------------------- Drawing state ---------------------------- */

/** Logical draw modes. Renderers (e.g. TerraDraw) map these to their own modes. */
export type DrawMode = 'select' | 'point' | 'linestring' | 'polygon' | 'circle';

/**
 * Imperative map actions a renderer implements. The engine calls these to
 * synchronise its headless draw state with whatever rendering surface is
 * attached. Renderers register their implementations via
 * `engine.setMapActions(impl)`.
 */
export interface DrawMapActions {
  /** Remove a feature's geometry from the map. */
  removeFeatureFromMap: (id: string) => void;
  /**
   * Toggle visibility on the map. Re-adding uses the stored GeoJSON from
   * engine state so previously-hidden features can be shown again.
   */
  setFeatureVisibility: (id: string, visible: boolean, geojson: GeoJSON.Feature) => void;
  /**
   * Replace a feature's on-map geometry after a semantic edit (e.g. a
   * circle radius change). Implementation removes + re-adds the GeoJSON.
   */
  updateFeatureGeometry: (id: string, geojson: GeoJSON.Feature) => void;
}

/* ------------------------------- Models -------------------------------- */

export type ParamType = 'number' | 'range';

export interface ModelParamDef {
  key: string;
  label: string;
  type: ParamType;
  min?: number;
  max?: number;
  step?: number;
  default: number;
}

/** A model plugin registered with the engine. Pure schema only — the act of
 *  computing happens in the model's `ComputeProvider` (registered separately
 *  via `engine.registerComputeProvider`). Models subscribe to data, not to
 *  the canvas or network (see architecture/core.md). */
export interface ModelDef {
  id: string;
  name: string;
  description?: string;
  params: ModelParamDef[];
}

export type ModelParams = Record<string, number>;

/* --------------------------- Compute pipeline --------------------------- */
//
// The engine never executes model logic itself — it orchestrates a pipeline:
//
//   preprocess (browser-side, offline, cancelable, ~ms)
//        → payload
//   submit     (backend / WASM / streaming, cancelable)
//        → RunResult
//
// Both stages receive an `AbortSignal`; starting a new run cancels the in-flight one.

/** Input to a `ComputeProvider.preprocess`. Engine builds this from the
 *  current draw state + the active model's params. */
export interface PreprocessContext {
  modelId: string;
  params: ModelParams;
  features: ReadonlyArray<DrawnFeature>;
}

/** The dev-defined shape returned by `preprocess`. Passed verbatim into the
 *  `submit` call's `payload` field. Opaque to the engine. */
export type PreprocessedPayload = unknown;

/** Result of the preprocess phase. The engine surfaces `warnings` in the UI. */
export interface PreprocessResult {
  payload: PreprocessedPayload;
  warnings?: string[];
}

/** Input to a `ComputeProvider.submit`. Includes the preprocessed payload and
 *  an `onProgress` callback the provider may invoke to drive the UI indicator. */
export interface SubmitContext {
  modelId: string;
  params: ModelParams;
  payload: PreprocessedPayload;
  onProgress?: (progress: RunProgress) => void;
}

/** The dev-defined result shape returned by `submit`. By convention, returns
 *  one of:
 *  - `{ layers: ResultLayerEntry[], summary? }` — a run with 0..N addressable
 *    result layers (the general form; each layer is independently togglable on
 *    the map and in `<ResultsPanel>`).
 *  - a bare `MapLayerEnvelope` or `{ layer: MapLayerEnvelope, summary? }` —
 *    a run with exactly one layer (backward-compatible shorthand).
 *  - a summary-only object — a run with zero layers. Check the resolved
 *    `RunRecord.layerIds` array; nothing to render when it's empty.
 *
 * Use `extractResultLayers()` (or its single-layer convenience
 * `extractLayerEnvelope()`) to recover the renderable layers. */
export type RunResult = unknown;

/** Structured form of a `RunResult` — a layer plus optional domain summary. */
export interface RunResultEnvelope {
  layer: MapLayerEnvelope;
  /** Opaque domain payload the dev's result panel renderer may consume. */
  summary?: unknown;
}

/** A run can yield 0..N addressable result layers. Each has a stable `id`
 *  (the dev picks it — e.g. the source circle's drawn-feature id) so it can be
 *  individually toggled on/off the map after the run completes. */
export interface ResultLayerEntry {
  id: string;
  envelope: MapLayerEnvelope;
}

/** Structured form of a `RunResult` with multiple layers. */
export interface RunResultLayers {
  layers: ResultLayerEntry[];
  /** Opaque domain payload the dev's result panel renderer may consume. */
  summary?: unknown;
}

/** Detect whether a value looks like a `MapLayerEnvelope` (has a `kind` the
 *  renderer narrows). Used internally by the extractors. */
function isMapLayerEnvelope(v: unknown): v is MapLayerEnvelope {
  return typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>).kind === 'string';
}

/** Narrow a `RunResult` into a list of addressable result layers. Handles
 *  the three conventions above: explicit `{ layers }`, the single-layer
 *  shorthand (bare envelope or `{ layer }`), and the zero-layer case. The
 *  single-layer shorthand yields one entry whose `id` is `defaultId` (the
 *  caller passes the run id). */
export function extractResultLayers(
  result: RunResult,
  defaultId = 'default',
): ResultLayerEntry[] {
  if (!isMapLayerEnvelope(result)) {
    if (typeof result === 'object' && result !== null) {
      const r = result as Record<string, unknown>;
      const layers = r.layers;
      if (Array.isArray(layers)) {
        const out: ResultLayerEntry[] = [];
        for (const item of layers) {
          if (typeof item !== 'object' || item === null) continue;
          const it = item as Record<string, unknown>;
          if (typeof it.id === 'string' && isMapLayerEnvelope(it.envelope)) {
            out.push({ id: it.id, envelope: it.envelope });
          }
        }
        return out;
      }
      if (isMapLayerEnvelope(r.layer)) {
        return [{ id: defaultId, envelope: r.layer }];
      }
    }
    return [];
  }
  return [{ id: defaultId, envelope: result }];
}

/** Convenience single-layer shortcut: the envelope of the first result layer,
 *  or `null` if the result has no layers. Equivalent to
 *  `extractResultLayers(result)[0]?.envelope ?? null`. */
export function extractLayerEnvelope(result: RunResult): MapLayerEnvelope | null {
  const layers = extractResultLayers(result);
  return layers.length > 0 ? layers[0]!.envelope : null;
}

/**
 * Port the dev implements to bring their model to life. Both methods are
 * cancelable via the supplied `AbortSignal`; failing to honour abort means
 * stale responses may still arrive and be ignored by the engine.
 *
 * Register one provider per model id via `engine.registerComputeProvider(modelId, provider)`.
 */
export interface ComputeProvider {
  /** Browser-side transformation: simplify, reproject, validate, build the
   *  network payload. Runs synchronously in the test/build environment. */
  preprocess(ctx: PreprocessContext, signal: AbortSignal): PreprocessResult | Promise<PreprocessResult>;
  /** Submit the preprocessed payload to the backend / WASM compute / etc.
   *  May call `ctx.onProgress` to update the UI bar while streaming. */
  submit(ctx: SubmitContext, signal: AbortSignal): Promise<RunResult>;
}

/* ------------------------------- Run state ------------------------------ */
//
// A run goes through named statuses; the engine dispatches transitions so
// subscribers (React hooks) can reflect progress / failure / cancellation.

export type RunStatus =
  | 'idle'
  | 'preprocessing'
  | 'submitting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

/** Progress event for the current phase. `step` names the phase the engine is
 *  currently in (so a 90% during "submit" doesn't imply 90% of the whole run). */
export interface RunProgress {
  /** Phase this progress belongs to. */
  step: RunProgressStep;
  /** 0..1 if known. `undefined` ⇒ indeterminate (UI shows animated stripes). */
  fraction?: number;
  /** Human-readable status string, surfaced verbatim by `<RunPanel>`. */
  label?: string;
}

export type RunProgressStep = 'preprocess' | 'submit' | 'stream';

/* --------------------------- Result visualisation ----------------------- */
//
// The renderer understands a closed `MapLayerEnvelope` union; the dev's
// `submit` returns a `RunResult` that is *either* such an envelope directly
// or a richer object embedding one. The engine stays opaque on the result
// shape — only renderers interpret the envelope.

/**
 * A self-describing layer the renderer knows how to draw. New kinds are
 * added to this union as renderers grow; the engine passes `unknown`
 * through and the renderer narrows via `kind`.
 */
export type MapLayerEnvelope =
  | { kind: 'geojson'; data: GeoJSON.FeatureCollection }
  | { kind: 'tiles'; url: string; sourceLayer?: string; type: 'raster' | 'vector' }
  | { kind: 'image'; url: string; bounds: [number, number, number, number] };

/**
 * A persisted run — history row + the renderer's visibility target. The
 * engine keeps all finished runs (until the user clears them) so multi-run
 * comparison toggles work cheaply.
 */
export interface RunRecord {
  runId: string;
  modelId: string;
  params: ModelParams;
  status: RunStatus;
  /** Opaque result returned by `submit`. `null` until the run succeeds. */
  result: RunResult | null;
  /** Set when `status === 'failed'`. */
  error: string | null;
  /** Last progress event received; null only before any progress arrives. */
  progress: RunProgress | null;
  startedAt: number;
  finishedAt: number | null;
  /** Stable ids of every result layer in `result` (0..N). Empty until the run
   *  succeeds and `extractResultLayers` is applied. */
  layerIds: string[];
  /** Subset of `layerIds` currently visible on the map. Toggled per-layer by
   *  `engine.showResultLayer` / `hideResultLayer`; the whole-run toggle keeps
   *  this in sync (show adds all, hide empties it). */
  visibleLayerIds: string[];
  /** Derived whole-run visibility flag = `visibleLayerIds.length > 0`.
   *  Backwards-compatible projection of the per-layer state for consumers that
   *  only need a master toggle. */
  visible: boolean;
}

/** Compact projection for history lists (drops the heavy `result` payload). */
export interface RunSummary {
  runId: string;
  modelId: string;
  status: RunStatus;
  error: string | null;
  progress: RunProgress | null;
  startedAt: number;
  finishedAt: number | null;
  /** Stable ids of every result layer (0..N). Empty until the run succeeds. */
  layerIds: string[];
  /** Subset of `layerIds` currently visible on the map. */
  visibleLayerIds: string[];
  /** Derived whole-run visibility flag = `visibleLayerIds.length > 0`. */
  visible: boolean;
  /** True when some but not all layers are visible (UI shows indeterminate
   *  master state). `false` when there are zero layers or full on/off. */
  partial: boolean;
}

/* --------------------------- Renderer port extension -------------------- */
//
// `DrawMapActions` covers the engine→renderer synchronisation for drawn
// features. `ResultLayerActions` is the symmetric port for result layers.
// A renderer implementing `DrawMapActions & ResultLayerActions` registers
// both via `engine.setMapActions(impl)`.

/**
 * Imperative result-layer actions a renderer implements. The engine calls
 * these when the user toggles a run's layers on the map. A run yields 0..N
 * addressable layers (see `extractResultLayers`); each is keyed by its
 * `layerId` so the renderer fan-outs one native source per `(runId, layerId)`
 * and tears it down cleanly on `removeResultLayer`. The renderer narrows
 * the envelope via `kind` and adds/removes its native source+layer.
 */
export interface ResultLayerActions {
  /** Add (or replace) a single result layer for this run. Re-entrant: a
   *  re-add for the same `(runId, layerId)` first removes the old native
   *  source/layer, then re-adds. */
  addResultLayer: (runId: string, layerId: string, envelope: MapLayerEnvelope) => void;
  /** Remove a single result layer for this run, if any. No-op if absent. */
  removeResultLayer: (runId: string, layerId: string) => void;
}

/* ----------------------------- Data sources ---------------------------- */

export type DataSourceKind = 'drawn' | 'upload';

export interface DataSourceDef {
  id: string;
  name: string;
  kind: DataSourceKind;
  /** Stable feature ids this source manages (for listing/visibility/edit). */
  featureIds: ReadonlyArray<string>;
}

/* ------------------------------- Renderer ------------------------------ */

/**
 * Port interface that render plugins (renderer-2d, renderer-3d) implement.
 * `@catshark/react`'s `Canvas` hosts the container element, instantiates a
 * renderer, and asks it to mount/unmount against a SimulationEngine.
 */
export interface Renderer {
  /** Mount the renderer into the host element and wire it to the engine. */
  mount(container: HTMLElement, engine: unknown): void | Promise<void>;
  /** Detach the renderer and release all listeners. */
  unmount(): void | Promise<void>;
}