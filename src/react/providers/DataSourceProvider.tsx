/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useDraw } from '../useEngine';
import type { DataSourceDef, DrawnFeature } from '../../core';

export const DRAWN_SOURCE_ID = 'drawn-features';

interface DataSourceContextValue {
  sources: DataSourceDef[];
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
      featureIds: state.features.map((f: DrawnFeature) => f.id),
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