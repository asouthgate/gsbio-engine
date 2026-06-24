/**
 * ../core — public, framework-agnostic API.
 *
 * Import from `../core` to create a SimulationEngine, register models
 * and data sources, or to consume engine types. The React/MapLibre bindings
 * live in `../react`, `../renderer-2d`, and `../client`.
 */

export * from './types';
export * from './spatial';
export * from './models/helloWorld';
export * from './mapStyles';
export * from './stubExecutor';

export {
  FeatureStore,
  type FeatureState,
  type FeatureAction,
} from './engine.featureStore';

export {
  SimulationEngine,
  createSimulationEngine,
  type EngineState,
  type EngineListener,
  type MapActions,
} from './engine';

export {
  EngineRunController,
  type RunState,
  type RunAction,
} from './engine.runController';
