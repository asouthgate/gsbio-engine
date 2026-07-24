import type { ReactNode } from 'react';
import type { SimulationEngine } from '../core';
import { EngineProvider } from './useEngine';

export interface GsbioEngineProviderProps {
  children: ReactNode;
  engine?: SimulationEngine;
}

export function GsbioEngineProvider({ children, engine }: GsbioEngineProviderProps) {
  return <EngineProvider engine={engine}>{children}</EngineProvider>;
}
