/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useDraw } from '../useEngine';
import { DRAWN_SOURCE_ID } from '@gsbio/core';
import type { DataSourceDef } from '@gsbio/core';

interface DataSourceContextValue {
  /** Combined list of all data source definitions, drawn source first. */
  sources: DataSourceDef[];
  /** The built-in drawn-features source. */
  drawnSource: DataSourceDef;
}

const DataSourceContext = createContext<DataSourceContextValue>({
  sources: [],
  drawnSource: { id: DRAWN_SOURCE_ID, name: 'Drawn features', kind: 'drawn', featureIds: [] },
});

export function DataSourceProvider({ children }: { children: ReactNode }) {
  const { state } = useDraw();
  const drawnSource = useMemo<DataSourceDef>(
    () => ({
      id: DRAWN_SOURCE_ID,
      name: 'Drawn features',
      kind: 'drawn',
      featureIds: state.features.map((f) => f.id),
    }),
    [state.features],
  );
  const sources = useMemo(() => [drawnSource], [drawnSource]);

  return (
    <DataSourceContext.Provider value={{ sources, drawnSource }}>
      {children}
    </DataSourceContext.Provider>
  );
}

export function useDataSources() {
  return useContext(DataSourceContext);
}