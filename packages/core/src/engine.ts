import type {
  CircleGeometry,
  Executor,
  DrawMapActions,
  DrawMode,
  DrawnFeature,
  MapLayerEnvelope,
  ModelDef,
  ResultLayerActions,
  RunProgress,
  RunRecord,
} from './types';
import { extractResultLayers } from './types';
import {
  circleToPolygon,
  lineStringToGeoJSONFeature,
  polygonRingToGeoJSONFeature,
  COORDINATE_PRECISION,
  type LngLat,
} from './spatial';
import { ensureDefaultDataSources } from './data/sourceRegistry';
import {
  ensureDefaultModels,
  ensureDefaultExecutors,
  registerModel as registerModelIntoRegistry,
} from './models/registry';
import {
  drawReducer,
  initialDrawState,
  type DrawAction,
  type DrawState,
} from './state/drawSlice';
import {
  initialModelState,
  modelReducer,
  type ModelAction,
  type ModelState,
} from './state/modelSlice';
import {
  initialRunState,
  runReducer,
  type RunAction,
  type RunState,
} from './state/runSlice';

/** Combined output port the renderer implements. `DrawMapActions` syncs the
 *  drawn features; `ResultLayerActions` syncs result layers (post-run). */
export type MapActions = DrawMapActions & ResultLayerActions;

/** Combined runtime state surfaced to subscribers. */
export interface EngineState {
  draw: DrawState;
  model: ModelState;
  run: RunState;
}

export type EngineListener = () => void;

/**
 * Headless simulation engine — the single source of truth for the data model
 * and runtime state. Owns the draw state tree, the model run state tree, the
 * run pipeline state, and the connections to whatever renderer is currently
 * attached (via `MapActions`) and which executors are registered for
 * each model. No React / maplibre / network code lives here.
 */
export class SimulationEngine {
  private _state: EngineState;
  private readonly _listeners = new Set<EngineListener>();
  /** Combined draw + result-layer port registered by the renderer. */
  mapActions: MapActions | null = null;
  /** Executors keyed by `ModelDef.id`. */
  private readonly _executors = new Map<string, Executor>();
  /** Active run's abort controller. `null` when no run is in flight. */
  private _abort: AbortController | null = null;
  /** Active run's promise. Used to serialise `run()` across overlapping calls. */
  private _currentRun: Promise<void> | null = null;
  /** Stable id generator (uses `crypto.randomUUID()` when available). */
  private _nextRunId = (): string =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  constructor() {
    ensureDefaultModels();
    ensureDefaultExecutors(this._executors);
    ensureDefaultDataSources();
    this._state = {
      draw: initialDrawState,
      model: initialModelState,
      run: initialRunState,
    };
  }

  /* -------------------------- Subscription API -------------------------- */

  subscribe = (listener: EngineListener): (() => void) => {
    this._listeners.add(listener);
    return () => {
      this._listeners.delete(listener);
    };
  };

  getSnapshot = (): EngineState => this._state;

  private emit(): void {
    for (const l of this._listeners) l();
  }

  private patch(partial: Partial<EngineState>): void {
    this._state = { ...this._state, ...partial };
    this.emit();
  }

  /* ----------------------------- Dispatch ------------------------------ */

  dispatchDraw = (action: DrawAction): void => {
    this.patch({ draw: drawReducer(this._state.draw, action) });
  };

  dispatchModel = (action: ModelAction): void => {
    this.patch({ model: modelReducer(this._state.model, action) });
  };

  dispatchRun = (action: RunAction): void => {
    this.patch({ run: runReducer(this._state.run, action) });
  };

  /* --------------------------- Map bridge wiring ------------------------ */

  setMapActions(actions: MapActions): void {
    this.mapActions = actions;
  }

  /* ----------------------------- Executors ------------------------------ */

  /** Convenience wrapper for `registerModel` from the process-global model
   *  registry. Models are pure schema shared across the engine (engines are
   *  normally singletons per page); this method exists so registration reads
   *  symmetrically next to `registerExecutor` at the call site. */
  registerModel = (def: ModelDef): void => {
    registerModelIntoRegistry(def);
  };

  /** Register (or replace) the `Executor` bound to a model id.
   *  Calling `run()` without an executor for the current model id is a
   *  `RUN_FAIL`. */
  registerExecutor = (modelId: string, executor: Executor): void => {
    this._executors.set(modelId, executor);
  };

  getExecutor = (modelId: string): Executor | undefined =>
    this._executors.get(modelId);

  /* ----------------------------- Run pipeline --------------------------- */

  /**
   * Start a new run for the currently selected model + current params.
   * Cancels any in-flight run before starting. Returns a promise that
   * resolves when the run has either succeeded, failed, or been cancelled
   * — callers do **not** need to await (`useRun` never does, it just
   * observes state).
   *
   * State transitions dispatched: `RUN_REQUEST → PREPROCESS_START →
   * SUBMIT_START → (PROGRESS)* → RUN_SUCCEED | RUN_FAIL | RUN_CANCEL`.
   */
  run = async (): Promise<void> => {
    // Serialise: if a run is in flight, cancel it and wait for it to settle.
    if (this._abort) {
      this.cancelRun();
      await this._currentRun;
    }
    const ac = new AbortController();
    this._abort = ac;
    const modelId = this._state.model.modelId;
    const params = { ...this._state.model.params };
    const runId = this._nextRunId();
    const startedAt = Date.now();

    const exec = async (): Promise<void> => {
      this.dispatchRun({ type: 'RUN_REQUEST', runId, modelId, params, startedAt });
      try {
        const executor = this._executors.get(modelId);
        if (!executor) {
          throw new Error(`No executor registered for model "${modelId}"`);
        }
        const features: ReadonlyArray<DrawnFeature> = this._state.draw.features;
        this.dispatchRun({ type: 'PREPROCESS_START' });
        const { payload } = await executor.preprocess({ modelId, params, features }, ac.signal);
        if (ac.signal.aborted) return;
        this.dispatchRun({ type: 'SUBMIT_START' });
        const onProgress = (p: RunProgress): void => {
          if (!ac.signal.aborted && this._abort === ac) {
            this.dispatchRun({ type: 'PROGRESS', payload: p });
          }
        };
        const result = await executor.submit({ modelId, params, payload, onProgress }, ac.signal);
        if (this._abort === ac && !ac.signal.aborted) {
          this.dispatchRun({ type: 'RUN_SUCCEED', result, finishedAt: Date.now() });
        }
      } catch (err) {
        if (this._abort !== ac) return; // a newer run replaced us; don't touch state
        if (ac.signal.aborted) {
          this.dispatchRun({ type: 'RUN_CANCEL', finishedAt: Date.now() });
        } else {
          const message = err instanceof Error ? err.message : String(err);
          this.dispatchRun({ type: 'RUN_FAIL', error: message, finishedAt: Date.now() });
        }
      } finally {
        if (this._abort === ac) {
          this._abort = null;
          this._currentRun = null;
        }
      }
    };

    this._currentRun = exec();
    await this._currentRun;
  };

  /** Abort the current in-flight run, if any. Idempotent. */
  cancelRun = (): void => {
    this._abort?.abort();
  };

  /* ----------------------------- Result layers -------------------------- */
  //
  // A successful run yields 0..N addressable result layers (the list comes
  // from `extractResultLayers(rec.result)` — the dev's `submit` either returns
  // `{ layers: ResultLayerEntry[] }` or the single-layer shorthand, both of
  // which the reducer resolves into `rec.layerIds`). Whole-run
  // `show/hide/toggleResult` fan out over every layer; the per-layer
  // `show/hide/toggleResultLayer` toggle one. The renderer port takes a
  // `(runId, layerId, envelope)` triple so each layer is independently managed
  // on the map.

  /** Resolve a run's result into a `layerId → envelope` map. Empty if the
   *  run has no layers (summary-only) or hasn't succeeded yet. */
  private resolveLayers(runId: string): Map<string, MapLayerEnvelope> {
    const rec = this.findRun(runId);
    if (!rec || !rec.result) return new Map();
    return new Map(extractResultLayers(rec.result, runId).map((l) => [l.id, l.envelope]));
  }

  /** Show every result layer for a successful run on the map. Idempotent;
   *  layers already visible are not re-added. No-op for a run with zero layers. */
  showResult = (runId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || rec.status !== 'succeeded' || rec.layerIds.length === 0) return;
    const toAdd = rec.layerIds.filter((id) => !rec.visibleLayerIds.includes(id));
    if (toAdd.length === 0) return;
    const layers = this.resolveLayers(runId);
    this.dispatchRun({ type: 'SHOW_RESULT', runId });
    for (const layerId of toAdd) {
      const envelope = layers.get(layerId);
      if (envelope) this.mapActions?.addResultLayer(runId, layerId, envelope);
    }
  };

  /** Hide every result layer for a run from the map. No-op if none are visible. */
  hideResult = (runId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || rec.visibleLayerIds.length === 0) return;
    const toRemove = [...rec.visibleLayerIds];
    this.dispatchRun({ type: 'HIDE_RESULT', runId });
    for (const layerId of toRemove) this.mapActions?.removeResultLayer(runId, layerId);
  };

  /** Toggle a run's whole-run visibility. Convenience for `<ResultsPanel>`
   *  master toggle: shows all when hidden/partial, hides all when fully on. */
  toggleResult = (runId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || rec.layerIds.length === 0) return;
    // Show when not all layers are visible (covers hidden + partial).
    if (rec.visibleLayerIds.length < rec.layerIds.length) this.showResult(runId);
    else this.hideResult(runId);
  };

  /** Show a single result layer for a run. Idempotent. No-op if the layer
   *  id isn't part of the run, or is already visible. */
  showResultLayer = (runId: string, layerId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || rec.status !== 'succeeded' || !rec.layerIds.includes(layerId) || rec.visibleLayerIds.includes(layerId)) return;
    const layers = this.resolveLayers(runId);
    const envelope = layers.get(layerId);
    if (!envelope) return;
    this.dispatchRun({ type: 'SHOW_RESULT_LAYER', runId, layerId });
    this.mapActions?.addResultLayer(runId, layerId, envelope);
  };

  /** Hide a single result layer for a run. No-op if not currently visible. */
  hideResultLayer = (runId: string, layerId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || !rec.visibleLayerIds.includes(layerId)) return;
    this.dispatchRun({ type: 'HIDE_RESULT_LAYER', runId, layerId });
    this.mapActions?.removeResultLayer(runId, layerId);
  };

  /** Toggle a single layer's visibility. Convenience for `<ResultsPanel>`
   *  per-layer checkboxes. */
  toggleResultLayer = (runId: string, layerId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || !rec.layerIds.includes(layerId)) return;
    if (rec.visibleLayerIds.includes(layerId)) this.hideResultLayer(runId, layerId);
    else this.showResultLayer(runId, layerId);
  };

  /** Remove a single run from history (or the current slot). Removes every
   *  currently-visible layer from the map first. */
  clearResult = (runId: string): void => {
    const rec = this.findRun(runId);
    if (rec) {
      for (const layerId of rec.visibleLayerIds) {
        this.mapActions?.removeResultLayer(runId, layerId);
      }
    }
    this.dispatchRun({ type: 'CLEAR_RESULT', runId });
  };

  /** Remove all runs from history and current. Removes any visible layers
   *  (per `(runId, layerId)` pair) before clearing state. */
  clearAllResults = (): void => {
    const cur = this._state.run.current;
    if (cur) {
      for (const layerId of cur.visibleLayerIds) {
        this.mapActions?.removeResultLayer(cur.runId, layerId);
      }
    }
    for (const rec of this._state.run.history) {
      for (const layerId of rec.visibleLayerIds) {
        this.mapActions?.removeResultLayer(rec.runId, layerId);
      }
    }
    this.dispatchRun({ type: 'CLEAR_ALL_RESULTS' });
  };

  /** Look up a run record by id, in current slot or history. */
  findRun = (runId: string): RunRecord | undefined => {
    const c = this._state.run.current;
    if (c?.runId === runId) return c;
    return this._state.run.history.find((r) => r.runId === runId);
  };

  /* --------------------------- Draw helpers ---------------------------- */

  startDrawing = (mode: DrawMode, category: string = ''): void => {
    this.dispatchDraw({ type: 'START_DRAWING', payload: { mode, category } });
  };

  selectMode = (): void => {
    this.dispatchDraw({ type: 'SET_DRAW_MODE', payload: 'select' });
  };

  removeFeature = (id: string): void => {
    this.dispatchDraw({ type: 'REMOVE_FEATURE', payload: id });
    this.mapActions?.removeFeatureFromMap(id);
  };

  toggleVisibility = (id: string): void => {
    const feature = this._state.draw.features.find((f) => f.id === id);
    if (!feature) return;
    const visible = !feature.visible;
    this.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { visible } } });
    this.mapActions?.setFeatureVisibility(id, visible, feature.geojson);
  };

  /**
   * Build a replacement GeoJSON.Feature for `feature` by swapping only the
   * `geometry` — preserving `id`, `properties` (incl. TerraDraw's
   * `properties.mode`), and `bbox`. Without this, helpers that build a fresh
   * `GeoJSON.Feature` strip the renderer-side identity that TerraDraw's
   * `addFeatures` requires (it rejects features with no `properties.mode`).
   */
  private replaceGeometry(feature: DrawnFeature, geometry: GeoJSON.Geometry): GeoJSON.Feature {
    return { ...feature.geojson, geometry };
  }

  /** Update a circle feature's center and/or radius, regenerating the polygon
   *  approximation on both engine state and the map. */
  updateCircle = (id: string, patch: Partial<CircleGeometry>): void => {
    const feature = this._state.draw.features.find((f) => f.id === id);
    if (!feature || !feature.circle) return;
    const circle = { ...feature.circle, ...patch };
    const geojson = this.replaceGeometry(feature, circleToPolygon(circle.center, circle.radiusMeters).geometry);
    this.dispatchDraw({
      type: 'UPDATE_FEATURE',
      payload: { id, updates: { circle, geojson } },
    });
    this.mapActions?.updateFeatureGeometry(id, geojson);
  };

  /** Move a point feature to a new lng/lat. */
  updatePointPosition = (id: string, lngLat: LngLat): void => {
    const feature = this._state.draw.features.find((f) => f.id === id);
    if (!feature || feature.geometryKind !== 'point') return;
    const f = 10 ** COORDINATE_PRECISION;
    const lng = Math.round(lngLat.lng * f) / f;
    const lat = Math.round(lngLat.lat * f) / f;
    const geometry: GeoJSON.Geometry = { type: 'Point', coordinates: [lng, lat] };
    const geojson = this.replaceGeometry(feature, geometry);
    this.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { geojson } } });
    this.mapActions?.updateFeatureGeometry(id, geojson);
  };

  /** Replace a linestring feature's vertices. */
  updateLineStringCoords = (id: string, coords: LngLat[]): void => {
    const feature = this._state.draw.features.find((f) => f.id === id);
    if (!feature || feature.geometryKind !== 'linestring') return;
    const geojson = this.replaceGeometry(feature, lineStringToGeoJSONFeature(coords).geometry);
    this.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { geojson } } });
    this.mapActions?.updateFeatureGeometry(id, geojson);
  };

  /** Replace a polygon feature's outer ring. The ring is re-closed if needed. */
  updatePolygonRing = (id: string, ring: LngLat[]): void => {
    const feature = this._state.draw.features.find((f) => f.id === id);
    if (!feature || feature.geometryKind !== 'polygon') return;
    const geojson = this.replaceGeometry(feature, polygonRingToGeoJSONFeature(ring).geometry);
    this.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { geojson } } });
    this.mapActions?.updateFeatureGeometry(id, geojson);
  };
}

/** Convenience factory. */
export function createSimulationEngine(): SimulationEngine {
  return new SimulationEngine();
}