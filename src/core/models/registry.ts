import type { Executor, ModelDef } from '../types';
import { helloWorldModel } from './helloWorld';

const models = new Map<string, ModelDef>();

/** Register a model plugin. Replaces an existing model with the same id. */
export function registerModel(def: ModelDef): void {
  models.set(def.id, def);
}

export function getModel(id: string): ModelDef | undefined {
  return models.get(id);
}

export function listModels(): ModelDef[] {
  return [...models.values()];
}

/** Default param values for a model, keyed by param key. */
export function defaultParamsFor(model: ModelDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of model.params) out[p.key] = p.default;
  return out;
}

let bootstrapped = false;
function bootstrap(): void {
  if (bootstrapped) return;
  bootstrapped = true;
  registerModel(helloWorldModel);
}

/** Ensure built-in models are registered. Safe to call repeatedly. */
export function ensureDefaultModels(): void {
  bootstrap();
}

/* ------------------------------- Executors ------------------------------- */

/**
 * Default in-browser executor for the hello-world stub model. Performs
 * a no-op preprocess + submit (yields an empty GeoJSON result envelope) so the
 * full pipeline can be exercised end-to-end without a backend.
 *
 * Honours `signal` so cancellation is observable; sleep is simulated via
 * `setTimeout` to demonstrate an async submit shaped like a real backend call.
 */
export const noopExecutor: Executor = {
  async preprocess(ctx, signal) {
    // Real executors reproject/simplify/validate here. The stub just echoes.
    void ctx;
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    return { payload: { params: ctx.params, featureCount: ctx.features.length } };
  },
  async submit(ctx, signal) {
    void ctx;
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, 50);
      signal.addEventListener(
        'abort',
        () => {
          clearTimeout(t);
          reject(new DOMException('Aborted', 'AbortError'));
        },
        { once: true },
      );
    });
    return {
      layer: {
        kind: 'geojson',
        data: { type: 'FeatureCollection', features: [] } as GeoJSON.FeatureCollection,
      },
      summary: { note: 'No-op result', featureCount: (ctx.payload as { featureCount?: number } | null)?.featureCount ?? 0 },
    };
  },
};

/** Seed `executors` map with the built-in executors. Called once per
 *  engine instance from the `SimulationEngine` constructor. */
export function ensureDefaultExecutors(
  executors: Map<string, Executor>,
): void {
  if (!executors.has('hello-world')) executors.set('hello-world', noopExecutor);
}