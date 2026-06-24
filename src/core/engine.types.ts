// simulation-engine.types.ts
import type { 
  DrawMapActions, 
  ResultLayerActions, 
} from './types';

import { type DrawState } from './engine.drawing';
import { type ModelState } from './engine.modelRegistry';
import { type RunState } from './engine.runController';

/** Combined output port the renderer implements. */
export type MapActions = DrawMapActions & ResultLayerActions;

/** Combined runtime state surfaced to subscribers. */
export interface EngineState {
  draw: DrawState;
  model: ModelState;
  run: RunState;
}

export type EngineListener = () => void;