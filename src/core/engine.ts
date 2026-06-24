import { FeatureStore } from './engine.featureStore';
import type { FeatureAction } from './engine.featureStore';
import type {
  Executor, DataFeature, ModelDef,
  RunLogLevel, RunProgress, RunRecord
} from './types';
import { extractResultLayers } from './types';
import type { ModelAction } from './engine.modelRegistry';
import { helloWorldModel } from './models/helloWorld';

import type { EngineState, EngineListener, MapActions } from './engine.types';
import { SourceRegistry } from './engine.sourceRegistry';
import { ModelRegistry } from './engine.modelRegistry';
import { EngineRunController, type RunAction } from './engine.runController';
export type { EngineState, EngineListener, MapActions };

export class SimulationEngine {
  private _state: EngineState;
  private readonly _listeners = new Set<EngineListener>();
  mapActions: MapActions | null = null;
  private readonly _executors = new Map<string, Executor>();
  private _abort: AbortController | null = null;
  private _currentRun: Promise<void> | null = null;
  autoShowResults = false;

  public readonly dataSources = new SourceRegistry();
  public models = new ModelRegistry();
  public readonly features = new FeatureStore(this);
  public readonly runs = new EngineRunController(this);

  private _nextRunId = (): string =>
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `run-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  constructor() {
    this.models.register(helloWorldModel);
    this._state = {
      features: this.features.getInitialState(),
      run: this.runs.getInitialState(),
      model: this.models.getInitialState('hello-world'),
    };
  }

  subscribe = (listener: EngineListener): (() => void) => {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  };

  getSnapshot = (): EngineState => this._state;
  private emit() { for (const l of this._listeners) l(); }
  private patch(partial: Partial<EngineState>) { this._state = { ...this._state, ...partial }; this.emit(); }

  dispatchFeature = (action: FeatureAction): void => this.patch({ features: this.features.reducer(this._state.features, action) });
  dispatchModel = (action: ModelAction): void => this.patch({ model: this.models.reducer(this._state.model, action) });
  dispatchRun = (action: RunAction): void => this.patch({ run: this.runs.reducer(this._state.run, action) });

  setMapActions(actions: MapActions): void { this.mapActions = actions; }
  registerModel = (def: ModelDef): void => { this.models.register(def); };
  registerExecutor = (modelId: string, executor: Executor): void => { this._executors.set(modelId, executor); };
  getExecutor = (modelId: string): Executor | undefined => this._executors.get(modelId);
  findRun = (runId: string): RunRecord | undefined => {
    const c = this._state.run.current;
    return c?.runId === runId ? c : this._state.run.history.find((r: RunRecord) => r.runId === runId);
  };

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
      this.dispatchRun({ type: 'RUN_REQUEST', runId, modelId, params, startedAt });
      const rawAppend = (level: RunLogLevel, message: string): void => {
        this.dispatchRun({ type: 'APPEND_RUN_LOG', entries: [{ ts: Date.now(), level, message }] });
      };
      const onLog = (level: RunLogLevel, message: string): void => {
        if (this._abort === ac && !ac.signal.aborted) rawAppend(level, message);
      };

      rawAppend('info', `Run started · model "${modelId}"`);
      try {
        const executor = this._executors.get(modelId);
        if (!executor) throw new Error(`No executor registered for model "${modelId}"`);

        const features: ReadonlyArray<DataFeature> = this._state.features.features;
        this.dispatchRun({ type: 'PREPROCESS_START' });
        rawAppend('info', 'Preprocessing…');
        const { payload } = await executor.preprocess({ modelId, params, features, onLog }, ac.signal);

        if (ac.signal.aborted) return;
        this.dispatchRun({ type: 'SUBMIT_START' });
        rawAppend('info', 'Submitting…');

        const onProgress = (p: RunProgress): void => {
          if (!ac.signal.aborted && this._abort === ac) this.dispatchRun({ type: 'PROGRESS', payload: p });
        };
        const result = await executor.submit({ modelId, params, payload, onProgress, onLog }, ac.signal);

        if (this._abort === ac && !ac.signal.aborted) {
          this.dispatchRun({ type: 'RUN_SUCCEED', result, finishedAt: Date.now() });
          const layerCount = extractResultLayers(result, runId).length;
          rawAppend('info', `Completed · ${layerCount} layer${layerCount === 1 ? '' : 's'}`);
          if (this.autoShowResults && layerCount > 0) {
            this.runs.showResult(runId);
          }
        }
      } catch (err) {
        if (this._abort !== ac) return;
        if (ac.signal.aborted) {
          this.dispatchRun({ type: 'RUN_CANCEL', finishedAt: Date.now() });
          rawAppend('info', 'Cancelled');
        } else {
          const message = err instanceof Error ? err.message : String(err);
          this.dispatchRun({ type: 'RUN_FAIL', error: message, finishedAt: Date.now() });
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

export function createSimulationEngine(): SimulationEngine {
  return new SimulationEngine();
}
