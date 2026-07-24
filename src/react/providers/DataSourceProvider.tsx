/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useEngine, useEngineState } from '../useEngine';
import type { DataSourceDef } from '../../core';
import { DRAWN_SOURCE_ID } from '../../core/engine.dataStore';

interface DataSourceContextValue {
  sources: DataSourceDef[];
  drawnSource: DataSourceDef;
}

const DataSourceContext = createContext<DataSourceContextValue>({
  sources: [],
  drawnSource: { id: DRAWN_SOURCE_ID, name: 'Drawn features', kind: 'drawn', featureIds: [] },
});

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const engine = useEngine();
  const state = useEngineState();

  const { sources, drawnSource } = useMemo(() => {
    const all = engine.dataStore.getSources();
    const drawn = all[0]!;
    return { sources: all, drawnSource: drawn };
  }, [engine, state.features]);

  return (
    <DataSourceContext.Provider value={{ sources, drawnSource }}>
      {children}
    </DataSourceContext.Provider>
  );
}

export function useDataSources() {
  return useContext(DataSourceContext);
}
