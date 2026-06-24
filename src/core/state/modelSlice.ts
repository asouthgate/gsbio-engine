import { getModel, defaultParamsFor, registerModel } from '../models/registry';
import { helloWorldModel } from '../models/helloWorld';
import type { ModelParams } from '../types';

export interface ModelState {
  modelId: string;
  params: ModelParams;
}

export type ModelAction =
  | { type: 'SET_MODEL'; payload: string }
  | { type: 'SET_PARAM'; payload: { key: string; value: number } }
  | { type: 'SET_PARAMS'; payload: ModelParams };

registerModel(helloWorldModel)

const initialModelId = getModel('hello-world')?.id ?? '';
const initialModel = getModel(initialModelId);

export const initialModelState: ModelState = {
  modelId: initialModelId,
  params: initialModel ? defaultParamsFor(initialModel) : {},
};

export function modelReducer(state: ModelState, action: ModelAction): ModelState {
  switch (action.type) {
    case 'SET_MODEL': {
      const def = getModel(action.payload);
      return {
        ...state,
        modelId: action.payload,
        params: def ? defaultParamsFor(def) : {},
      };
    }
    case 'SET_PARAM':
      return { ...state, params: { ...state.params, [action.payload.key]: action.payload.value } };
    case 'SET_PARAMS':
      return { ...state, params: { ...state.params, ...action.payload } };
    default:
      return state;
  }
}