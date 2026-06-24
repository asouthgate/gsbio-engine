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
  type FeatureAction,
  type EngineState,
  type LngLat,
  type RunSummary,
  type SimulationEngine,
} from '../core';
import { type ModelAction } from '../core/engine.modelRegistry';

const EngineContext = createContext<SimulationEngine | null>(null);

export interface EngineProviderProps {
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

export function useEngineState(): EngineState {
  const engine = useEngine();
  return useSyncExternalStore(engine.subscribe, engine.getSnapshot, engine.getSnapshot);
}


export interface FeatureHook {
  state: EngineState['features'];
  dispatch: (action: FeatureAction) => void;
  removeFeature: (id: string) => void;
  toggleVisibility: (id: string) => void;
  updatePointPosition: (id: string, lngLat: LngLat) => void;
  updateCircle: (id: string, patch: Partial<CircleGeometry>) => void;
  updateLineStringCoords: (id: string, coords: LngLat[]) => void;
  updatePolygonRing: (id: string, ring: LngLat[]) => void;
}

export function useFeatures(): FeatureHook {
  const engine = useEngine();
  const { features } = useEngineState();
  return {
    state: features,
    dispatch: engine.dispatchFeature,
    removeFeature: engine.features.removeFeature,
    toggleVisibility: engine.features.toggleVisibility,
    updatePointPosition: engine.features.updatePointPosition,
    updateCircle: engine.features.updateCircle,
    updateLineStringCoords: engine.features.updateLineStringCoords,
    updatePolygonRing: engine.features.updatePolygonRing,
  };
}

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

export interface RunHook {
  state: EngineState['run'];
  run: () => Promise<void>;
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

export interface ResultsHook {
  summaries: RunSummary[];
  current: RunSummary | null;
  showResult: (runId: string) => void;
  hideResult: (runId: string) => void;
  toggleResult: (runId: string) => void;
  showResultLayer: (runId: string, layerId: string) => void;
  hideResultLayer: (runId: string, layerId: string) => void;
  toggleResultLayer: (runId: string, layerId: string) => void;
  clearResult: (runId: string) => void;
  clearAll: () => void;
}

export function useResults(): ResultsHook {
  const engine = useEngine();
  const { run } = useEngineState();
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
