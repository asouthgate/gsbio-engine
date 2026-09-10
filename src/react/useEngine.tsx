/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import {
  createEngine,
  type CircleGeometry,
  type EngineState,
  type LngLat,
  type RunSummary,
  type SimulationEngine,
  type DataFeature,
  type DataSourceDef,
  type RawSource,
} from '../core';

const EngineContext = createContext<SimulationEngine | null>(null);

export interface EngineProviderProps {
  engine?: SimulationEngine;
  children: ReactNode;
}

export function EngineProvider({ engine, children }: EngineProviderProps) {
  const value = useMemo(() => engine ?? createEngine(), [engine]);
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
  addFeature: (feature: DataFeature) => void;
  updateFeature: (id: string, updates: Partial<DataFeature>) => void;
  selectFeature: (id: string | null) => void;
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
    addFeature: (f) => engine.addFeature(f),
    updateFeature: (id, u) => engine.updateFeature(id, u),
    selectFeature: (id) => engine.selectFeature(id),
    removeFeature: (id) => engine.removeFeature(id),
    toggleVisibility: (id) => engine.toggleFeatureVisibility(id),
    updatePointPosition: (id, ll) => engine.updatePointPosition(id, ll),
    updateCircle: (id, p) => engine.updateCircle(id, p),
    updateLineStringCoords: (id, c) => engine.updateLineStringCoords(id, c),
    updatePolygonRing: (id, r) => engine.updatePolygonRing(id, r),
  };
}

export interface ModelHook {
  state: EngineState['model'];
  setModel: (modelId: string) => void;
  setModelParam: (key: string, value: number) => void;
  setModelParams: (params: Record<string, number>) => void;
  setStage: (stage: string) => void;
}

export function useModel(): ModelHook {
  const engine = useEngine();
  const { model } = useEngineState();
  return {
    state: model,
    setModel: (modelId) => engine.setModel(modelId),
    setModelParam: (key, value) => engine.setModelParam(key, value),
    setModelParams: (params) => engine.setModelParams(params),
    setStage: (stage) => engine.setStage(stage),
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
  const summaries = useMemo(() => engine.allSummaries(run), [run]);
  return {
    summaries,
    current: summaries.length > 0 ? summaries[0]! : null,
    showResult: engine.showResult,
    hideResult: engine.hideResult,
    toggleResult: engine.toggleResult,
    showResultLayer: engine.showResultLayer,
    hideResultLayer: engine.hideResultLayer,
    toggleResultLayer: engine.toggleResultLayer,
    clearResult: engine.clearResult,
    clearAll: engine.clearAllResults,
  };
}

export function useDataSources(): DataSourceDef[] {
  const engine = useEngine();
  const { features } = useEngineState();
  return useMemo(() => engine.dataStore.getSources(), [engine, features]);
}

export function useRawSources(): RawSource[] {
  const engine = useEngine();
  useEngineState();
  return useMemo(() => engine.dataStore.getRawSources(), [engine]);
}
