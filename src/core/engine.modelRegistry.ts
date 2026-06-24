import type { ModelDef, ModelParams } from './types';

export interface ModelState {
  modelId: string;
  params: ModelParams;
}

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

  getInitialState(defaultId: string = 'hello-world'): ModelState {
    const initialModelId = this.get(defaultId)?.id ?? '';
    const initialModel = this.get(initialModelId);

    return {
      modelId: initialModelId,
      params: initialModel ? this.defaultParamsFor(initialModel) : {},
    };
  }
}
