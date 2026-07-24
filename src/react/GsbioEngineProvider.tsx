import type { ReactNode } from 'react';
import type { SimulationEngine } from '../core';
import { EngineProvider } from './useEngine';
import { DataSourceProvider } from './providers/DataSourceProvider';

export interface GsbioEngineProviderProps {
  children: ReactNode;
  engine?: SimulationEngine;
}

export function GsbioEngineProvider({ children, engine }: GsbioEngineProviderProps) {
  return (
    <EngineProvider engine={engine}>
      <DataSourceProvider>{children}</DataSourceProvider>
    </EngineProvider>
  );
}
