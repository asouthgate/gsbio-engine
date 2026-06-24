// src/core/state/EngineRunController.ts
import {
  extractResultLayers,
  type ModelParams,
  type RunLogEntry,
  type RunProgress,
  type RunRecord,
  type RunResult,
  type RunStatus,
  type RunSummary,
} from './types';

export interface RunState {
  /** The active-or-most-recent run. `null` only before the first run ever. */
  current: RunRecord | null;
  /** Past runs, newest-first. Never auto-evicted. */
  history: RunRecord[];
}

export type RunAction =
  | { type: 'RUN_REQUEST'; runId: string; modelId: string; params: ModelParams; startedAt: number }
  | { type: 'PREPROCESS_START' }
  | { type: 'SUBMIT_START' }
  | { type: 'PROGRESS'; payload: RunProgress }
  | { type: 'RUN_SUCCEED'; result: RunResult; finishedAt: number }
  | { type: 'RUN_FAIL'; error: string; finishedAt: number }
  | { type: 'RUN_CANCEL'; finishedAt: number }
  | { type: 'APPEND_RUN_LOG'; entries: RunLogEntry[] }
  | { type: 'SHOW_RESULT'; runId: string }
  | { type: 'HIDE_RESULT'; runId: string }
  | { type: 'SHOW_RESULT_LAYER'; runId: string; layerId: string }
  | { type: 'HIDE_RESULT_LAYER'; runId: string; layerId: string }
  | { type: 'CLEAR_RESULT'; runId: string }
  | { type: 'CLEAR_ALL_RESULTS' };

export class EngineRunController {
  /** Baseline empty state layout */
  getInitialState(): RunState {
    return {
      current: null,
      history: [],
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Pure Reducer Loop                                                        */
  /* ------------------------------------------------------------------------ */

  reducer = (state: RunState, action: RunAction): RunState => {
    switch (action.type) {
      case 'RUN_REQUEST': {
        const moved = this.pushCurrentToHistory(state);
        return {
          ...moved,
          current: this.emptyRecord(
            action.runId,
            action.modelId,
            action.params,
            action.startedAt,
          ),
        };
      }
      case 'PREPROCESS_START':
        if (!state.current) return state;
        return {
          ...state,
          current: this.setStatus(state.current, 'preprocessing'),
        };
      case 'SUBMIT_START':
        if (!state.current) return state;
        return {
          ...state,
          current: this.setStatus(state.current, 'submitting'),
        };
      case 'PROGRESS': {
        if (!state.current) return state;
        const nextStatus =
          action.payload.step === 'stream' ? 'running' : state.current.status;
        return {
          ...state,
          current: {
            ...state.current,
            status: nextStatus,
            progress: action.payload,
          },
        };
      }
      case 'RUN_SUCCEED': {
        if (!state.current) return state;
        const layers: { id: string }[] = extractResultLayers(action.result, state.current.runId);
        const layerIds = layers.map((l: { id: string }) => l.id);
        return {
          ...state,
          current: {
            ...state.current,
            status: 'succeeded',
            result: action.result,
            finishedAt: action.finishedAt,
            layerIds,
            visibleLayerIds: [],
            visible: false,
          },
        };
      }
      case 'RUN_FAIL':
        if (!state.current) return state;
        return {
          ...state,
          current: {
            ...state.current,
            status: 'failed',
            error: action.error,
            finishedAt: action.finishedAt,
          },
        };
      case 'RUN_CANCEL':
        if (!state.current) return state;
        return {
          ...state,
          current: {
            ...state.current,
            status: 'cancelled',
            finishedAt: action.finishedAt,
          },
        };
      case 'APPEND_RUN_LOG': {
        if (!state.current) return state;
        if (action.entries.length === 0) return state;
        return {
          ...state,
          current: {
            ...state.current,
            log: [...state.current.log, ...action.entries],
          },
        };
      }
      case 'SHOW_RESULT':
        return this.applyRunVisibility(state, action.runId, true);
      case 'HIDE_RESULT':
        return this.applyRunVisibility(state, action.runId, false);
      case 'SHOW_RESULT_LAYER':
        return this.applyLayerVisibility(state, action.runId, action.layerId, true);
      case 'HIDE_RESULT_LAYER':
        return this.applyLayerVisibility(state, action.runId, action.layerId, false);
      case 'CLEAR_RESULT': {
        if (state.current?.runId === action.runId) {
          return { ...state, current: null };
        }
        return {
          ...state,
          history: state.history.filter((r: RunRecord) => r.runId !== action.runId),
        };
      }
      case 'CLEAR_ALL_RESULTS':
        return this.getInitialState();
      default:
        return state;
    }
  };

  /* ------------------------------------------------------------------------ */
  /* Controller Pipeline Helpers                                              */
  /* ------------------------------------------------------------------------ */

  private emptyRecord(
    runId: string,
    modelId: string,
    params: ModelParams,
    startedAt: number,
  ): RunRecord {
    return {
      runId,
      modelId,
      params,
      status: 'idle',
      result: null,
      error: null,
      progress: null,
      startedAt,
      finishedAt: null,
      log: [],
      layerIds: [],
      visibleLayerIds: [],
      visible: false,
    };
  }

  private setStatus(rec: RunRecord, status: RunStatus): RunRecord {
    return { ...rec, status };
  }

  private withLayerVisibility(rec: RunRecord, visibleLayerIds: string[]): RunRecord {
    return { ...rec, visibleLayerIds, visible: visibleLayerIds.length > 0 };
  }

  private pushCurrentToHistory(state: RunState): RunState {
    if (state.current === null) return state;
    const c = state.current;
    if (c.status === 'succeeded' || c.status === 'failed' || c.status === 'cancelled') {
      return { ...state, history: [c, ...state.history], current: null };
    }
    return { ...state, current: null };
  }

  private applyRunVisibility(state: RunState, runId: string, visible: boolean): RunState {
    const patch = (rec: RunRecord): RunRecord => {
      const next = visible && rec.layerIds.length > 0 ? [...rec.layerIds] : ([] as string[]);
      return this.withLayerVisibility(rec, next);
    };
    if (state.current?.runId === runId) {
      return { ...state, current: patch(state.current) };
    }
    return {
      ...state,
      history: state.history.map((r: RunRecord) => (r.runId === runId ? patch(r) : r)),
    };
  }

  private applyLayerVisibility(state: RunState, runId: string, layerId: string, visible: boolean): RunState {
    const patch = (rec: RunRecord): RunRecord => {
      if (!rec.layerIds.includes(layerId)) return rec;
      const set = new Set(rec.visibleLayerIds);
      if (visible) set.add(layerId);
      else set.delete(layerId);
      return this.withLayerVisibility(rec, [...set]);
    };
    if (state.current?.runId === runId) {
      return { ...state, current: patch(state.current) };
    }
    return {
      ...state,
      history: state.history.map((r: RunRecord) => (r.runId === runId ? patch(r) : r)),
    };
  }

  /* ------------------------------------------------------------------------ */
  /* Projections & Summaries                                                  */
  /* ------------------------------------------------------------------------ */

  toSummary(rec: RunRecord): RunSummary {
    const visible = rec.visibleLayerIds.length > 0;
    const partial =
      rec.layerIds.length > 0 &&
      rec.visibleLayerIds.length > 0 &&
      rec.visibleLayerIds.length < rec.layerIds.length;
    return {
      runId: rec.runId,
      modelId: rec.modelId,
      status: rec.status,
      error: rec.error,
      progress: rec.progress,
      startedAt: rec.startedAt,
      finishedAt: rec.finishedAt,
      log: rec.log,
      warnings: rec.log.filter((e: RunLogEntry) => e.level === 'warning').map((e: RunLogEntry) => e.message),
      layerIds: rec.layerIds,
      visibleLayerIds: rec.visibleLayerIds,
      visible,
      partial,
    };
  }

  allSummaries(state: RunState): RunSummary[] {
    const cur = state.current ? [this.toSummary(state.current)] : [];
    return [...cur, ...state.history.map((r: RunRecord) => this.toSummary(r))];
  }
}