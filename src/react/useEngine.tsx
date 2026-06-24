/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  createSimulationEngine,
  type CircleGeometry,
  type DrawAction,
  type DrawMode,
  type EngineState,
  type LngLat,
  type RunSummary,
  type SimulationEngine,
} from '../core';
import { type ModelAction } from '../core/engine.modelRegistry';

const EngineContext = createContext<SimulationEngine | null>(null);

export interface EngineProviderProps {
  /** Inject an existing engine (e.g. for tests). By default a new one is created. */
  engine?: SimulationEngine;
  children: ReactNode;
}

export function EngineProvider({ engine, children }: EngineProviderProps) {
  const value = useMemo(() => engine ?? createSimulationEngine(), [engine]);
  return <EngineContext.Provider value={value}>{children}</EngineContext.Provider>;
}

export function useEngine(): SimulationEngine {
  const engine = useContext(EngineContext);
  if (!engine) {
    throw new Error('useEngine() must be used inside <EngineProvider>.');
  }
  return engine;
}

/** Subscribe to the engine's combined snapshot. Re-renders on every change. */
export function useEngineState(): EngineState {
  const engine = useEngine();
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}

/* ------------------------------- useDraw -------------------------------- */

export interface DrawHook {
  state: EngineState['draw'];
  dispatch: (action: DrawAction) => void;
  startDrawing: (mode: DrawMode, category?: string) => void;
  selectMode: () => void;
  removeFeature: (id: string) => void;
  toggleVisibility: (id: string) => void;
  updatePointPosition: (id: string, lngLat: LngLat) => void;
  updateCircle: (id: string, patch: Partial<CircleGeometry>) => void;
  updateLineStringCoords: (id: string, coords: LngLat[]) => void;
  updatePolygonRing: (id: string, ring: LngLat[]) => void;
}

export function useDraw(): DrawHook {
  const engine = useEngine();
  const { draw } = useEngineState();
  return {
    state: draw,
    dispatch: engine.dispatchDraw,
    startDrawing: engine.drawing.startDrawing,
    selectMode: engine.drawing.selectMode,
    removeFeature: engine.drawing.removeFeature,
    toggleVisibility: engine.drawing.toggleVisibility,
    updatePointPosition: engine.drawing.updatePointPosition,
    updateCircle: engine.drawing.updateCircle,
    updateLineStringCoords: engine.drawing.updateLineStringCoords,
    updatePolygonRing: engine.drawing.updatePolygonRing,
  };
}

/* ------------------------------- useModel ------------------------------- */
//
// Schema-only: choose model + edit params. The act of running lives in
// `useRun` / `useResults` (the `Executor` port owns network).

export interface ModelHook {
  state: EngineState['model'];
  dispatch: (action: ModelAction) => void;
}

export function useModel(): ModelHook {
  const engine = useEngine();
  const { model } = useEngineState();
  return {
    state: model,
    dispatch: engine.dispatchModel,
  };
}

/* -------------------------------- useRun -------------------------------- */

export interface RunHook {
  state: EngineState['run'];
  /** Start a new run for the current model + params. Cancels any in-flight
   *  run. Resolves when the run finishes (succeeded/failed/cancelled); most
   *  callers ignore the returned promise and just observe `state`. */
  run: () => Promise<void>;
  /** Abort the current in-flight run, if any. */
  cancel: () => void;
}

export function useRun(): RunHook {
  const engine = useEngine();
  const { run } = useEngineState();
  return {
    state: run,
    run: engine.run,
    cancel: engine.cancelRun,
  };
}

/* ------------------------------ useResults ------------------------------ */

export interface ResultsHook {
  /** Ordered summaries of all runs (current + history), newest-first. */
  summaries: RunSummary[];
  /** The current (in-flight or most recent) run, or null. */
  current: RunSummary | null;
  showResult: (runId: string) => void;
  hideResult: (runId: string) => void;
  toggleResult: (runId: string) => void;
  /** Toggle a single result layer's visibility within a run. */
  showResultLayer: (runId: string, layerId: string) => void;
  hideResultLayer: (runId: string, layerId: string) => void;
  toggleResultLayer: (runId: string, layerId: string) => void;
  clearResult: (runId: string) => void;
  clearAll: () => void;
}

export function useResults(): ResultsHook {
  const engine = useEngine();
  const { run } = useEngineState();
  // Cheap projection of the slice into summaries (drops the heavy `result`
  // payload; keeps only the cheap layer-id strings). Re-runs on every engine
  // state change; memoised on `run`.
  const summaries = useMemo(() => engine.runs.allSummaries(run), [run]);
  return {
    summaries,
    current: summaries.length > 0 ? summaries[0]! : null,
    showResult: engine.runs.showResult,
    hideResult: engine.runs.hideResult,
    toggleResult: engine.runs.toggleResult,
    showResultLayer: engine.runs.showResultLayer,
    hideResultLayer: engine.runs.hideResultLayer,
    toggleResultLayer: engine.runs.toggleResultLayer,
    clearResult: engine.runs.clearResult,
    clearAll: engine.runs.clearAllResults,
  };
}