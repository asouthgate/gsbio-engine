import type { ModelDef, ModelParams } from './types';

export interface ModelState {
  modelId: string;
  params: ModelParams;
}

export type ModelAction =
  | { type: 'SET_MODEL'; payload: string }
  | { type: 'SET_PARAM'; payload: { key: string; value: number } }
  | { type: 'SET_PARAMS'; payload: ModelParams };

export class ModelRegistry {
  private _models = new Map<string, ModelDef>();

  register(def: ModelDef): void {
    this._models.set(def.id, def);
  }

  get(id: string): ModelDef | undefined {
    return this._models.get(id);
  }

  list(): ModelDef[] {
    return [...this._models.values()];
  }

  defaultParamsFor(model: ModelDef): Record<string, number> {
    const out: Record<string, number> = {};
    for (const p of model.params) {
      out[p.key] = p.default;
    }
    return out;
  }

  /**
   * Matches your exact original initial state derivation logic.
   * Looks up the default model from this instance's map.
   */
  getInitialState(defaultId: string = 'hello-world'): ModelState {
    const initialModelId = this.get(defaultId)?.id ?? '';
    const initialModel = this.get(initialModelId);

    return {
      modelId: initialModelId,
      params: initialModel ? this.defaultParamsFor(initialModel) : {},
    };
  }

  /**
   * Your exact original reducer functionality, bound to this registry instance.
   */
  reducer(state: ModelState, action: ModelAction): ModelState {
    switch (action.type) {
      case 'SET_MODEL': {
        const def = this.get(action.payload);
        return {
          ...state,
          modelId: action.payload,
          params: def ? this.defaultParamsFor(def) : {},
        };
      }
      case 'SET_PARAM':
        return { 
          ...state, 
          params: { ...state.params, [action.payload.key]: action.payload.value } 
        };
      case 'SET_PARAMS':
        return { 
          ...state, 
          params: { ...state.params, ...action.payload } 
        };
      default:
        return state;
    }
  }
}