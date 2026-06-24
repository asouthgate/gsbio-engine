import type { FeatureMapActions } from './engine.featureStore.types';
import type { ResultLayerActions } from './engine.runController.types';
import type { FeatureState } from './engine.featureStore';
import type { ModelState } from './engine.modelRegistry';
import type { RunState } from './engine.runController';

export type MapActions = FeatureMapActions & ResultLayerActions;

export interface EngineState {
  features: FeatureState;
  model: ModelState;
  run: RunState;
}

export type EngineListener = () => void;
