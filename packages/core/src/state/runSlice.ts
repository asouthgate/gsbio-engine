import {
  extractResultLayers,
  type ModelParams,
  type RunProgress,
  type RunRecord,
  type RunResult,
  type RunStatus,
  type RunSummary,
} from '../types';

/**
 * Headless state for the model-run pipeline. Owns the *current* run plus an
 * unbounded history of past runs (the user clears them explicitly — see
 * `CLEAR_RESULT` / `CLEAR_ALL_RESULTS`).
 *
 * The engine drives transitions through `RunAction`; `useRun` / `useResults`
 * read the snapshot. `current` is the live, in-flight or just-finished run;
 * on `RUN_REQUEST` the previous current (if finished) moves to `history`.
 */
export interface RunState {
  /** The active-or-most-recent run. `null` only before the first run ever. */
  current: RunRecord | null;
  /** Past runs, newest-first. Never auto-evicted. */
  history: RunRecord[];
}

export const initialRunState: RunState = {
  current: null,
  history: [],
};

export type RunAction =
  | { type: 'RUN_REQUEST'; runId: string; modelId: string; params: ModelParams; startedAt: number }
  | { type: 'PREPROCESS_START' }
  | { type: 'SUBMIT_START' }
  | { type: 'PROGRESS'; payload: RunProgress }
  | { type: 'RUN_SUCCEED'; result: RunResult; finishedAt: number }
  | { type: 'RUN_FAIL'; error: string; finishedAt: number }
  | { type: 'RUN_CANCEL'; finishedAt: number }
  | { type: 'SHOW_RESULT'; runId: string }
  | { type: 'HIDE_RESULT'; runId: string }
  | { type: 'SHOW_RESULT_LAYER'; runId: string; layerId: string }
  | { type: 'HIDE_RESULT_LAYER'; runId: string; layerId: string }
  | { type: 'CLEAR_RESULT'; runId: string }
  | { type: 'CLEAR_ALL_RESULTS' };

function emptyRecord(
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
    layerIds: [],
    visibleLayerIds: [],
    visible: false,
  };
}

function setStatus(rec: RunRecord, status: RunStatus): RunRecord {
  return { ...rec, status };
}

/** Re-derive the whole-run `visible` flag from per-layer visibility. Covers
 *  every visibility mutation site so the boolean never drifts. */
function withLayerVisibility(
  rec: RunRecord,
  visibleLayerIds: string[],
): RunRecord {
  return { ...rec, visibleLayerIds, visible: visibleLayerIds.length > 0 };
}

/**
 * Promote `current` to history when a new run starts. Already-finished
 * records move into `history`; an in-flight `current` is dropped (the
 * orchestrator cancels it before dispatching `RUN_REQUEST`).
 */
function pushCurrentToHistory(state: RunState): RunState {
  if (state.current === null) return state;
  const c = state.current;
  // Only finished runs belong in the history; in-flight ones were aborted.
  if (
    c.status === 'succeeded' ||
    c.status === 'failed' ||
    c.status === 'cancelled'
  ) {
    return { ...state, history: [c, ...state.history], current: null };
  }
  // In-flight run is being replaced — drop without retaining (it was aborted).
  return { ...state, current: null };
}

/** Apply a whole-run visibility toggle (show adds every layer, hide empties)
 *  to either current or any history row by id. Leaves `layerIds` untouched. */
function applyRunVisibility(
  state: RunState,
  runId: string,
  visible: boolean,
): RunState {
  const patch = (rec: RunRecord): RunRecord => {
    const next =
      visible && rec.layerIds.length > 0
        ? [...rec.layerIds]
        : [] as string[];
    return withLayerVisibility(rec, next);
  };
  if (state.current?.runId === runId) {
    return { ...state, current: patch(state.current) };
  }
  return {
    ...state,
    history: state.history.map((r) => (r.runId === runId ? patch(r) : r)),
  };
}

/** Toggle a single layer's visibility within a record: add to (show) or
 *  remove from (hide) `visibleLayerIds`. Idempotent. No-op if the layer id
 *  isn't in the record's `layerIds`. */
function applyLayerVisibility(
  state: RunState,
  runId: string,
  layerId: string,
  visible: boolean,
): RunState {
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
    history: state.history.map((r) => (r.runId === runId ? patch(r) : r)),
  };
}

export function runReducer(state: RunState, action: RunAction): RunState {
  switch (action.type) {
    case 'RUN_REQUEST': {
      const moved = pushCurrentToHistory(state);
      return {
        ...moved,
        current: emptyRecord(
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
        current: setStatus(state.current, 'preprocessing'),
      };
    case 'SUBMIT_START':
      if (!state.current) return state;
      return {
        ...state,
        current: setStatus(state.current, 'submitting'),
      };
    case 'PROGRESS': {
      if (!state.current) return state;
      // A streaming progress event (step='stream') promotes status to
      // 'running' to mark backend compute has actually begun.
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
      // Resolve the dev's result into a stable list of addressable layer ids.
      // The default per-layer id is the run id (single-layer shorthand case).
      const layers: { id: string }[] = extractResultLayers(action.result, state.current.runId);
      const layerIds = layers.map((l) => l.id);
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
    case 'SHOW_RESULT':
      return applyRunVisibility(state, action.runId, true);
    case 'HIDE_RESULT':
      return applyRunVisibility(state, action.runId, false);
    case 'SHOW_RESULT_LAYER':
      return applyLayerVisibility(state, action.runId, action.layerId, true);
    case 'HIDE_RESULT_LAYER':
      return applyLayerVisibility(state, action.runId, action.layerId, false);
    case 'CLEAR_RESULT': {
      if (state.current?.runId === action.runId) {
        return { ...state, current: null };
      }
      return {
        ...state,
        history: state.history.filter((r) => r.runId !== action.runId),
      };
    }
    case 'CLEAR_ALL_RESULTS':
      return { ...initialRunState };
    default:
      return state;
  }
}

/** Project a `RunRecord` into a `RunSummary` (drops the heavy `result`
 *  payload; keeps only the cheap layer-id strings). */
export function toSummary(rec: RunRecord): RunSummary {
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
    layerIds: rec.layerIds,
    visibleLayerIds: rec.visibleLayerIds,
    visible,
    partial,
  };
}

/**
 * Summaries for *all* runs — newest-first. The current run (if any) appears
 * first; the history follows. Useful for `<ResultsPanel>` history list.
 */
export function allSummaries(state: RunState): RunSummary[] {
  const cur = state.current ? [toSummary(state.current)] : [];
  return [...cur, ...state.history.map(toSummary)];
}