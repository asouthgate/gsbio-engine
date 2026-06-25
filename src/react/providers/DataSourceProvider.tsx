/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useFeatures, useEngineState } from '../useEngine';
import type { DataSourceDef, DataFeature } from '../../core';

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
  const { state } = useFeatures();
  const engineState = useEngineState();
  const drawnSource = useMemo<DataSourceDef>(
    () => {
      const fileSourceIds = new Set(engineState.fileSources.flatMap((s) => s.featureIds));
      return {
        id: DRAWN_SOURCE_ID,
        name: 'Drawn features',
        kind: 'drawn',
        featureIds: state.features
          .filter((f: DataFeature) => !fileSourceIds.has(f.id))
          .map((f: DataFeature) => f.id),
      };
    },
    [state.features, engineState.fileSources],
  );

  const fileSources = useMemo<DataSourceDef[]>(
    () =>
      engineState.fileSources.map((fs) => ({
        id: fs.sourceId,
        name: fs.name,
        kind: 'upload' as const,
        featureIds: fs.featureIds,
      })),
    [engineState.fileSources],
  );

  const sources = useMemo(
    () => [drawnSource, ...fileSources],
    [drawnSource, fileSources],
  );

  return (
    <DataSourceContext.Provider value={{ sources, drawnSource }}>
      {children}
    </DataSourceContext.Provider>
  );
}

export function useDataSources() {
  return useContext(DataSourceContext);
}
