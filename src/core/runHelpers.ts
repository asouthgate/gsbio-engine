import type {
  RunRecord,
  RunStatus,
  RunSummary,
  RunLogEntry,
  ModelParams,
} from './types';
import type { RunState } from './engine.runController';

export function emptyRunRecord(runId: string, modelId: string, params: ModelParams, startedAt: number): RunRecord {
  return {
    runId, modelId, params, status: 'idle', result: null, error: null, progress: null,
    startedAt, finishedAt: null, log: [], layerIds: [], visibleLayerIds: [], visible: false,
  };
}

export function setRunStatus(rec: RunRecord, status: RunStatus): RunRecord {
  return { ...rec, status };
}

export function withLayerVisibility(rec: RunRecord, visibleLayerIds: string[]): RunRecord {
  return { ...rec, visibleLayerIds, visible: visibleLayerIds.length > 0 };
}

export function pushCurrentToHistory(state: RunState): RunState {
  if (state.current === null) return state;
  const c = state.current;
  if (c.status === 'succeeded' || c.status === 'failed' || c.status === 'cancelled') {
    return { ...state, history: [c, ...state.history], current: null };
  }
  return { ...state, current: null };
}

export function applyRunVisibility(state: RunState, runId: string, visible: boolean): RunState {
  const patch = (rec: RunRecord): RunRecord => {
    const next = visible && rec.layerIds.length > 0 ? [...rec.layerIds] : ([] as string[]);
    return withLayerVisibility(rec, next);
  };
  if (state.current?.runId === runId) {
    return { ...state, current: patch(state.current) };
  }
  return {
    ...state,
    history: state.history.map((r: RunRecord) => (r.runId === runId ? patch(r) : r)),
  };
}

export function applyLayerVisibility(state: RunState, runId: string, layerId: string, visible: boolean): RunState {
  const patch = (rec: RunRecord): RunRecord => {
    if (!rec.layerIds.includes(layerId)) return rec;
    const set = new Set(rec.visibleLayerIds);
    if (visible) set.add(layerId);
    else set.delete(layerId);
    return withLayerVisibility(rec, [...set]);
  };
  if (state.current?.runId === runId) {
    return { ...state, current: patch(state.current) };
  }
  return {
    ...state,
    history: state.history.map((r: RunRecord) => (r.runId === runId ? patch(r) : r)),
  };
}

export function findRun(state: RunState, runId: string): RunRecord | undefined {
  return state.current?.runId === runId ? state.current
    : state.history.find((r: RunRecord) => r.runId === runId);
}

export function toSummary(rec: RunRecord): RunSummary {
  const visible = rec.visibleLayerIds.length > 0;
  const partial = rec.layerIds.length > 0 && rec.visibleLayerIds.length > 0 && rec.visibleLayerIds.length < rec.layerIds.length;
  return {
    runId: rec.runId, modelId: rec.modelId, status: rec.status, error: rec.error, progress: rec.progress,
    startedAt: rec.startedAt, finishedAt: rec.finishedAt, log: rec.log,
    warnings: rec.log.filter((e: RunLogEntry) => e.level === 'warning').map((e: RunLogEntry) => e.message),
    layerIds: rec.layerIds, visibleLayerIds: rec.visibleLayerIds, visible, partial,
  };
}

export function allSummaries(state: RunState): RunSummary[] {
  const cur = state.current ? [toSummary(state.current)] : [];
  return [...cur, ...state.history.map((r: RunRecord) => toSummary(r))];
}
