import type {
  ModelParams,
  RunProgress,
  RunRecord,
  RunResult,
  RunStatus,
  RunSummary,
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
    visible: false,
  };
}

function setStatus(rec: RunRecord, status: RunStatus): RunRecord {
  return { ...rec, status };
}

/** Mark a record as visible (`SHOW_RESULT`) or hidden (`HIDE_RESULT`). */
function withVisibility(rec: RunRecord, visible: boolean): RunRecord {
  return { ...rec, visible };
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

/** Apply a visibility toggle to either current or any history row by id. */
function applyVisibility(
  state: RunState,
  runId: string,
  visible: boolean,
): RunState {
  if (state.current?.runId === runId) {
    return { ...state, current: withVisibility(state.current, visible) };
  }
  return {
    ...state,
    history: state.history.map((r) =>
      r.runId === runId ? withVisibility(r, visible) : r,
    ),
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
    case 'RUN_SUCCEED':
      if (!state.current) return state;
      return {
        ...state,
        current: {
          ...state.current,
          status: 'succeeded',
          result: action.result,
          finishedAt: action.finishedAt,
        },
      };
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
      return applyVisibility(state, action.runId, true);
    case 'HIDE_RESULT':
      return applyVisibility(state, action.runId, false);
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

/** Project a `RunRecord` into a `RunSummary` (drops the heavy `result`). */
export function toSummary(rec: RunRecord): RunSummary {
  return {
    runId: rec.runId,
    modelId: rec.modelId,
    status: rec.status,
    error: rec.error,
    progress: rec.progress,
    startedAt: rec.startedAt,
    finishedAt: rec.finishedAt,
    visible: rec.visible,
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