import type { ReactNode } from 'react';
import { EngineProvider } from './useEngine';
import { DataSourceProvider } from './providers/DataSourceProvider';

export interface AppProviderProps {
  children: ReactNode;
  /** Inject a pre-built engine (e.g. for tests). */
  engine?: import('@gsbio/core').SimulationEngine;
}

/**
 * Composite provider: creates a SimulationEngine (or accepts one) and wires
 * the data-source provider that derives a drawn-features source from engine
 * state. Consumers read via `useEngine`, `useDraw`, `useModel`,
 * `useDataSources`.
 */
export function AppProvider({ children, engine }: AppProviderProps) {
  return (
    <EngineProvider engine={engine}>
      <DataSourceProvider>{children}</DataSourceProvider>
    </EngineProvider>
  );
}