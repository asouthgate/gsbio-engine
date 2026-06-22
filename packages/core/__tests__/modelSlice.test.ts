import { describe, it, expect, beforeEach } from 'vitest';
import {
  modelReducer,
  initialModelState,
  getModel,
  listModels,
  registerModel,
  defaultParamsFor,
  ensureDefaultModels,
  type ModelDef,
} from '../src/index';

describe('modelReducer', () => {
  it('SET_PARAM updates a single param', () => {
    const state = modelReducer(initialModelState, {
      type: 'SET_PARAM',
      payload: { key: 'iterations', value: 250 },
    });
    expect(state.params.iterations).toBe(250);
    expect(state.params.threshold).toBe(initialModelState.params.threshold);
  });

  it('SET_PARAMS merges params', () => {
    const state = modelReducer(initialModelState, {
      type: 'SET_PARAMS',
      payload: { threshold: 0.9 },
    });
    expect(state.params.threshold).toBe(0.9);
    expect(state.params.iterations).toBe(initialModelState.params.iterations);
  });

  it('SET_MODEL resets params to the new model defaults', () => {
    const state = modelReducer(initialModelState, { type: 'SET_MODEL', payload: 'hello-world' });
    expect(state.modelId).toBe('hello-world');
    expect(state.params.iterations).toBe(100);
    expect(state.params.diffusionRate).toBe(0.1);
    expect(state.params.threshold).toBe(0.5);
  });
});

describe('engine model registry', () => {
  beforeEach(() => {
    ensureDefaultModels();
  });

  it('lists the hello-world model', () => {
    const ids = listModels().map((m) => m.id);
    expect(ids).toContain('hello-world');
  });

  it('hello-world model has expected params', () => {
    const m = getModel('hello-world');
    expect(m).toBeDefined();
    const keys = m!.params.map((p) => p.key);
    expect(keys).toEqual(['iterations', 'diffusionRate', 'threshold']);
  });

  it('defaultParamsFor collapses params to key->default', () => {
    const m = getModel('hello-world')!;
    expect(defaultParamsFor(m)).toEqual({ iterations: 100, diffusionRate: 0.1, threshold: 0.5 });
  });

  it('registerModel replaces an existing model', () => {
    const replacement: ModelDef = {
      id: 'hello-world',
      name: 'Replaced',
      params: [{ key: 'alpha', label: 'Alpha', type: 'number', default: 1 }],
    };
    registerModel(replacement);
    expect(getModel('hello-world')!.name).toBe('Replaced');
    // restore for other tests
    ensureDefaultModels();
  });
});