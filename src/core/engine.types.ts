// simulation-engine.types.ts
import type { 
  DrawMapActions, 
  ResultLayerActions, 
} from './types';

import { type DrawState } from './state/drawSlice';
import { type ModelState } from './engine.modelRegistry';
import { type RunState } from './state/runSlice';

/** Combined output port the renderer implements. */
export type MapActions = DrawMapActions & ResultLayerActions;

/** Combined runtime state surfaced to subscribers. */
export interface EngineState {
  draw: DrawState;
  model: ModelState;
  run: RunState;
}

export type EngineListener = () => void;