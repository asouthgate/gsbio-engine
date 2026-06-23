/**
 * @gsbio/core — public, framework-agnostic API.
 *
 * Import from `@gsbio/core` to create a SimulationEngine, register models
 * and data sources, or to consume engine types. The React/MapLibre bindings
 * live in `@gsbio/react`, `@gsbio/renderer-2d`, and `@gsbio/client`.
 */

export * from './types';
export * from './spatial';
export * from './data/sourceRegistry';
export * from './models/registry';
export * from './models/helloWorld';
export * from './state/drawSlice';
export * from './state/modelSlice';
export * from './state/runSlice';
export * from './stubExecutor';
export {
  SimulationEngine,
  createSimulationEngine,
  type EngineState,
  type EngineListener,
  type MapActions,
} from './engine';