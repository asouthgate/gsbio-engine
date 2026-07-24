import type { DrawMode, FeatureMapActions, FeatureState } from './engine.feature.types';
import type { ResultLayerActions, RunState } from './engine.runController.types';
import type { ModelState } from './engine.modelRegistry';

export type MapActions = FeatureMapActions & ResultLayerActions;

export interface DrawState {
  mode: DrawMode;
  category: string;
}

export interface EngineState {
  features: FeatureState;
  model: ModelState;
  run: RunState;
  drawMode: DrawState;
}

export type EngineListener = () => void;
