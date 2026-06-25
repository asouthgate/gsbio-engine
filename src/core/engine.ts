import type {
  Executor, DataFeature, CircleGeometry, ModelDef, ModelParams,
  RunLogLevel, RunProgress, RunRecord, MapLayerEnvelope, RunSummary,
} from './types';
import { extractResultLayers } from './types';
import { helloWorldModel } from './models/helloWorld';
import { DataStore } from './engine.dataStore';
import type { FileSourceState } from './engine.dataStore';
import { ModelRegistry } from './engine.modelRegistry';
import { replaceGeometry } from './featureHelpers';
import {
  circleToPolygon,
  lineStringToGeoJSONFeature,
  polygonRingToGeoJSONFeature,
  COORDINATE_PRECISION,
  type LngLat,
} from './spatial';
import {
  emptyRunRecord,
  setRunStatus,
  pushCurrentToHistory,
  applyRunVisibility,
  applyLayerVisibility,
  findRun as findRunInState,
  allSummaries as computeAllSummaries,
} from './runHelpers';
import type { EngineState, EngineListener, MapActions } from './engine.types';
import type { RunState } from './engine.runController.types';
import type { FileSourceDef } from './engine.fileSource.types';
export type { EngineState, EngineListener, MapActions };
export { type FileSourceState };

export class SimulationEngine {
  public readonly dataStore: DataStore;
  private _state: EngineState;
  private readonly _listeners = new Set<EngineListener>();
  mapActions: MapActions | null = null;
  private readonly _executors = new Map<string, Executor>();
  private _abort: AbortController | null = null;
  private _currentRun: Promise<void> | null = null;
  autoShowResults = false;

  public readonly models = new ModelRegistry();

  private _nextRunId = (): string =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  constructor(dataStore?: DataStore) {
    this.dataStore = dataStore ?? new DataStore();
    this.models.register(helloWorldModel);
    this._state = {
      features: this.dataStore.getSnapshot(),
      run: { current: null, history: [] },
      model: this.models.getInitialState('hello-world'),
    };
  }

  subscribe = (listener: EngineListener): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  getSnapshot = (): EngineState => this._state;

  private emit() {
    this._state = { ...this._state, features: this.dataStore.getSnapshot() };
    for (const l of this._listeners) l();
  }

  addFeature(feature: DataFeature): void {
    this.dataStore.addFeature(feature);
    const gj = this._withTerraDrawMode(feature);
    this.mapActions?.addFeatureToMap(feature.id, gj);
    this.emit();
  }

  addFileSourceFeatures(def: FileSourceDef, data: object): DataFeature[] {
    const parsed = this.dataStore.addGeoJsonSource(def, data);
    for (const f of parsed) {
      this.mapActions?.addFeatureToMap(f.id, this._withTerraDrawMode(f));
    }
    this.emit();
    return parsed;
  }

  private _withTerraDrawMode(f: DataFeature): GeoJSON.Feature {
    const mode = `${f.geometryKind}__${f.category}`;
    const existing = f.geojson.properties ?? {};
    return {
      id: f.id,
      type: 'Feature',
      geometry: f.geojson.geometry,
      properties: { ...existing, mode },
    } as unknown as GeoJSON.Feature;
  }

  removeFeature(id: string): void {
    this.dataStore.removeFeature(id);
    this.mapActions?.removeFeatureFromMap(id);
    this.emit();
  }

  updateFeature(id: string, updates: Partial<DataFeature>): void {
    this.dataStore.updateFeature(id, updates);
    this.emit();
  }

  selectFeature(id: string | null): void {
    this.dataStore.selectFeature(id);
    this.emit();
  }

  clearFeatures(): void {
    this.dataStore.clearFeatures();
    this.emit();
  }

  private featureById(id: string): DataFeature | undefined {
    return this.dataStore.getFeature(id);
  }

  toggleFeatureVisibility(id: string): void {
    const updated = this.dataStore.toggleVisibility(id);
    if (!updated) return;
    this.mapActions?.setFeatureVisibility(id, updated.visible, updated.geojson);
    this.emit();
  }

  updateCircle(id: string, patch: Partial<CircleGeometry>): void {
    const f = this.featureById(id);
    if (!f || !f.circle) return;
    const circle = { ...f.circle, ...patch };
    const geojson = replaceGeometry(f, circleToPolygon(circle.center, circle.radiusMeters).geometry);
    this.dataStore.replaceGeometry(id, geojson, circle);
    this.mapActions?.updateFeatureGeometry(id, geojson);
    this.emit();
  }

  updatePointPosition(id: string, lngLat: LngLat): void {
    const f = this.featureById(id);
    if (!f || f.geometryKind !== 'point') return;
    const fRatio = 10 ** COORDINATE_PRECISION;
    const lng = Math.round(lngLat.lng * fRatio) / fRatio;
    const lat = Math.round(lngLat.lat * fRatio) / fRatio;
    const geometry: GeoJSON.Geometry = { type: 'Point', coordinates: [lng, lat] };
    const geojson = replaceGeometry(f, geometry);
    this.dataStore.replaceGeometry(id, geojson);
    this.mapActions?.updateFeatureGeometry(id, geojson);
    this.emit();
  }

  updateLineStringCoords(id: string, coords: LngLat[]): void {
    const f = this.featureById(id);
    if (!f || f.geometryKind !== 'linestring') return;
    const geojson = replaceGeometry(f, lineStringToGeoJSONFeature(coords).geometry);
    this.dataStore.replaceGeometry(id, geojson);
    this.mapActions?.updateFeatureGeometry(id, geojson);
    this.emit();
  }

  updatePolygonRing(id: string, ring: LngLat[]): void {
    const f = this.featureById(id);
    if (!f || f.geometryKind !== 'polygon') return;
    const geojson = replaceGeometry(f, polygonRingToGeoJSONFeature(ring).geometry);
    this.dataStore.replaceGeometry(id, geojson);
    this.mapActions?.updateFeatureGeometry(id, geojson);
    this.emit();
  }

  setModel(modelId: string): void {
    const def = this.models.get(modelId);
    if (!def) {
      console.warn(`[Engine] Cannot set model: ${modelId} not found.`);
      return;
    }
    this._state.model = { modelId, params: this.models.defaultParamsFor(def) };
    this.emit();
  }

  setModelParam(key: string, value: number): void {
    this._state.model = {
      ...this._state.model,
      params: { ...this._state.model.params, [key]: value },
    };
    this.emit();
  }

  setModelParams(params: ModelParams): void {
    this._state.model = { ...this._state.model, params: { ...this._state.model.params, ...params } };
    this.emit();
  }

  registerModel(def: ModelDef): void {
    this.models.register(def);
    if (this._state.model.modelId === '' || !this.models.get(this._state.model.modelId)) {
      this._state.model = { modelId: def.id, params: this.models.defaultParamsFor(def) };
      this.emit();
    }
  }

  setMapActions(actions: MapActions): void { this.mapActions = actions; }

  registerExecutor(modelId: string, executor: Executor): void {
    this._executors.set(modelId, executor);
  }

  getExecutor(modelId: string): Executor | undefined {
    return this._executors.get(modelId);
  }


  private resolveRunLayers(runId: string): Map<string, MapLayerEnvelope> {
    const rec = this.findRun(runId);
    if (!rec || !rec.result) return new Map();
    return new Map(extractResultLayers(rec.result, runId).map((l) => [l.id, l.envelope]));
  }

  showResult = (runId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || rec.status !== 'succeeded' || rec.layerIds.length === 0) return;
    const toAdd = rec.layerIds.filter((id) => !rec.visibleLayerIds.includes(id));
    if (toAdd.length === 0) return;
    const layers = this.resolveRunLayers(runId);
    for (const layerId of toAdd) {
      const envelope = layers.get(layerId);
      if (envelope) this.mapActions?.addResultLayer(runId, layerId, envelope);
    }
    this._state.run = applyRunVisibility(this._state.run, runId, true);
    this.emit();
  };

  hideResult = (runId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || rec.visibleLayerIds.length === 0) return;
    for (const layerId of rec.visibleLayerIds) this.mapActions?.removeResultLayer(runId, layerId);
    this._state.run = applyRunVisibility(this._state.run, runId, false);
    this.emit();
  };

  toggleResult = (runId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || rec.layerIds.length === 0) return;
    if (rec.visibleLayerIds.length < rec.layerIds.length) this.showResult(runId);
    else this.hideResult(runId);
  };

  showResultLayer = (runId: string, layerId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || rec.status !== 'succeeded' || !rec.layerIds.includes(layerId) || rec.visibleLayerIds.includes(layerId)) return;
    const layers = this.resolveRunLayers(runId);
    const envelope = layers.get(layerId);
    if (!envelope) return;
    this.mapActions?.addResultLayer(runId, layerId, envelope);
    this._state.run = applyLayerVisibility(this._state.run, runId, layerId, true);
    this.emit();
  };

  hideResultLayer = (runId: string, layerId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || !rec.visibleLayerIds.includes(layerId)) return;
    this.mapActions?.removeResultLayer(runId, layerId);
    this._state.run = applyLayerVisibility(this._state.run, runId, layerId, false);
    this.emit();
  };

  toggleResultLayer = (runId: string, layerId: string): void => {
    const rec = this.findRun(runId);
    if (!rec || !rec.layerIds.includes(layerId)) return;
    if (rec.visibleLayerIds.includes(layerId)) this.hideResultLayer(runId, layerId);
    else this.showResultLayer(runId, layerId);
  };

  clearResult = (runId: string): void => {
    const rec = this.findRun(runId);
    if (rec) {
      for (const layerId of rec.visibleLayerIds) {
        this.mapActions?.removeResultLayer(runId, layerId);
      }
    }
    if (this._state.run.current?.runId === runId) {
      this._state.run = { ...this._state.run, current: null };
    } else {
      this._state.run = {
        ...this._state.run,
        history: this._state.run.history.filter((r) => r.runId !== runId),
      };
    }
    this.emit();
  };

  clearAllResults = (): void => {
    const { current, history } = this._state.run;
    if (current) {
      for (const layerId of current.visibleLayerIds) {
        this.mapActions?.removeResultLayer(current.runId, layerId);
      }
    }
    for (const rec of history) {
      for (const layerId of rec.visibleLayerIds) {
        this.mapActions?.removeResultLayer(rec.runId, layerId);
      }
    }
    this._state.run = { current: null, history: [] };
    this.emit();
  };

  findRun(runId: string): RunRecord | undefined {
    return findRunInState(this._state.run, runId);
  }

  allSummaries(state?: RunState): RunSummary[] {
    return computeAllSummaries(state ?? this._state.run);
  }


  run = async (): Promise<void> => {
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
      const record = emptyRunRecord(runId, modelId, params, startedAt);
      this._state.run = { ...pushCurrentToHistory(this._state.run), current: record };
      this.emit();

      const rawAppend = (level: RunLogLevel, message: string): void => {
        if (!this._state.run.current) return;
        this._state.run.current = {
          ...this._state.run.current,
          log: [...this._state.run.current.log, { ts: Date.now(), level, message }],
        };
        this.emit();
      };
      const onLog = (level: RunLogLevel, message: string): void => {
        if (this._abort === ac && !ac.signal.aborted) rawAppend(level, message);
      };

      rawAppend('info', `Run started · model "${modelId}"`);
      try {
        const executor = this._executors.get(modelId);
        if (!executor) throw new Error(`No executor registered for model "${modelId}"`);

        const features: ReadonlyArray<DataFeature> = this.dataStore.getFeatures();

        rawAppend('info', 'Preprocessing…');
        this._state.run = { ...this._state.run, current: setRunStatus(this._state.run.current!, 'preprocessing') };
        this.emit();
        const { payload } = await executor.preprocess({ modelId, params, features, onLog }, ac.signal);

        if (ac.signal.aborted) return;

        rawAppend('info', 'Submitting…');
        this._state.run = { ...this._state.run, current: setRunStatus(this._state.run.current!, 'submitting') };
        this.emit();

        const onProgress = (p: RunProgress): void => {
          if (!ac.signal.aborted && this._abort === ac && this._state.run.current) {
            const nextStatus = p.step === 'stream' ? 'running' : this._state.run.current.status;
            this._state.run.current = { ...this._state.run.current, status: nextStatus, progress: p };
            this.emit();
          }
        };
        const result = await executor.submit({ modelId, params, payload, onProgress, onLog }, ac.signal);

        if (this._abort === ac && !ac.signal.aborted) {
          const layers = extractResultLayers(result, runId);
          const layerIds = layers.map((l: { id: string }) => l.id);
          this._state.run.current = {
            ...this._state.run.current!,
            status: 'succeeded',
            result,
            finishedAt: Date.now(),
            layerIds,
            visibleLayerIds: [],
            visible: false,
          };
          this.emit();
          rawAppend('info', `Completed · ${layerIds.length} layer${layerIds.length === 1 ? '' : 's'}`);
          if (this.autoShowResults && layerIds.length > 0) {
            this.showResult(runId);
          }
        }
      } catch (err) {
        if (this._abort !== ac) return;
        if (ac.signal.aborted) {
          if (this._state.run.current) {
            this._state.run.current = { ...this._state.run.current, status: 'cancelled', finishedAt: Date.now() };
            this.emit();
          }
          rawAppend('info', 'Cancelled');
        } else {
          const message = err instanceof Error ? err.message : String(err);
          if (this._state.run.current) {
            this._state.run.current = { ...this._state.run.current, status: 'failed', error: message, finishedAt: Date.now() };
            this.emit();
          }
          rawAppend('error', message);
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

  cancelRun = (): void => { this._abort?.abort(); };
}

export function createSimulationEngine(dataStore?: DataStore): SimulationEngine {
  return new SimulationEngine(dataStore);
}
