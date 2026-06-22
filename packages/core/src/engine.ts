import type {
  CircleGeometry,
  ComputeProvider,
  DrawMapActions,
  DrawMode,
  DrawnFeature,
  ResultLayerActions,
  RunProgress,
  RunRecord,
} from './types';
import { extractLayerEnvelope } from './types';
import {
  circleToPolygon,
  lineStringToGeoJSONFeature,
  polygonRingToGeoJSONFeature,
  COORDINATE_PRECISION,
  type LngLat,
} from './spatial';
import { ensureDefaultDataSources } from './data/sourceRegistry';
import { ensureDefaultModels, ensureDefaultComputeProviders } from './models/registry';
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
 * attached (via `MapActions`) and which compute providers are registered for
 * each model. No React / maplibre / network code lives here.
 */
export class SimulationEngine {
  private _state: EngineState;
  private readonly _listeners = new Set<EngineListener>();
  /** Combined draw + result-layer port registered by the renderer. */
  mapActions: MapActions | null = null;
  /** Compute providers keyed by `ModelDef.id`. */
  private readonly _computeProviders = new Map<string, ComputeProvider>();
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
    ensureDefaultComputeProviders(this._computeProviders);
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

  /* ------------------------- Compute providers -------------------------- */

  /** Register (or replace) the `ComputeProvider` bound to a model id.
   *  Calling `run()` without a provider for the current model id is a
   *  `RUN_FAIL`. */
  registerComputeProvider = (modelId: string, provider: ComputeProvider): void => {
    this._computeProviders.set(modelId, provider);
  };

  getComputeProvider = (modelId: string): ComputeProvider | undefined =>
    this._computeProviders.get(modelId);

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
        const provider = this._computeProviders.get(modelId);
        if (!provider) {
          throw new Error(`No compute provider registered for model "${modelId}"`);
        }
        const features: ReadonlyArray<DrawnFeature> = this._state.draw.features;
        this.dispatchRun({ type: 'PREPROCESS_START' });
        const { payload } = await provider.preprocess({ modelId, params, features }, ac.signal);
        if (ac.signal.aborted) return;
        this.dispatchRun({ type: 'SUBMIT_START' });
        const onProgress = (p: RunProgress): void => {
          if (!ac.signal.aborted && this._abort === ac) {
            this.dispatchRun({ type: 'PROGRESS', payload: p });
          }
        };
        const result = await provider.submit({ modelId, params, payload, onProgress }, ac.signal);
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

  /** Show a successful run's result layer on the map. Idempotent: re-showing
   *  an already-visible layer is a no-op for the renderer (replace semantics). */
  showResult = (runId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || rec.status !== 'succeeded' || !rec.result || rec.visible) return;
    const envelope = extractLayerEnvelope(rec.result);
    if (!envelope) return; // result is summary-only — nothing to render
    this.dispatchRun({ type: 'SHOW_RESULT', runId });
    this.mapActions?.addResultLayer(runId, envelope);
  };

  /** Hide a run's result layer from the map. No-op if already hidden. */
  hideResult = (runId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || !rec.visible) return;
    this.dispatchRun({ type: 'HIDE_RESULT', runId });
    this.mapActions?.removeResultLayer(runId);
  };

  /** Toggle a run's result-layer visibility. Convenience for `<ResultsPanel>`. */
  toggleResult = (runId: string): void => {
    const rec = this.findRun(runId);
    if (!rec) return;
    if (rec.visible) this.hideResult(runId);
    else this.showResult(runId);
  };

  /** Remove a single run from history (or the current slot). Removes the
   *  map layer first if it was visible. */
  clearResult = (runId: string): void => {
    const rec = this.findRun(runId);
    if (rec?.visible) this.mapActions?.removeResultLayer(runId);
    this.dispatchRun({ type: 'CLEAR_RESULT', runId });
  };

  /** Remove all runs from history and current. Removes any visible layers. */
  clearAllResults = (): void => {
    const cur = this._state.run.current;
    if (cur?.visible) this.mapActions?.removeResultLayer(cur.runId);
    for (const rec of this._state.run.history) {
      if (rec.visible) this.mapActions?.removeResultLayer(rec.runId);
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