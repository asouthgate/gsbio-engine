import type { FeatureMapActions, FeatureState } from './engine.feature.types';
import type { ResultLayerActions, RunState } from './engine.runController.types';
import type { ModelState } from './engine.modelRegistry';

export type MapActions = FeatureMapActions & ResultLayerActions;

export interface FileSourceState {
  sourceId: string;
  name: string;
  featureIds: string[];
}

export interface EngineState {
  features: FeatureState;
  model: ModelState;
  run: RunState;
  fileSources: FileSourceState[];
}

export type EngineListener = () => void;
