import type { ModelDef } from '../types';

const models = new Map<string, ModelDef>();

export function registerModel(def: ModelDef): void {
  models.set(def.id, def);
}

export function getModel(id: string): ModelDef | undefined {
  return models.get(id);
}

export function listModels(): ModelDef[] {
  return [...models.values()];
}

export function defaultParamsFor(model: ModelDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of model.params) out[p.key] = p.default;
  return out;
}
