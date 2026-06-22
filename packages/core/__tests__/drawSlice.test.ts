import { describe, it, expect } from 'vitest';
import {
  drawReducer,
  initialDrawState,
  geometryKindForMode,
  type DrawnFeature,
} from '../src/index';

const makeFeature = (id: string, geometryKind: DrawnFeature['geometryKind'] = 'point'): DrawnFeature => ({
  id,
  geometryKind,
  category: '',
  label: '',
  visible: true,
  geojson: {
    type: 'Feature',
    geometry: { type: 'Point', coordinates: [0, 0] },
    properties: {},
  },
});

describe('drawReducer', () => {
  it('ADD_FEATURE appends a feature', () => {
    const feature = makeFeature('f1');
    const state = drawReducer(initialDrawState, { type: 'ADD_FEATURE', payload: feature });
    expect(state.features).toHaveLength(1);
    expect(state.features[0].id).toBe('f1');
  });

  it('REMOVE_FEATURE removes by id and clears selection if removed', () => {
    const f1 = makeFeature('f1');
    const f2 = makeFeature('f2');
    const stateWithFeatures = { ...initialDrawState, features: [f1, f2], selectedFeatureId: 'f1' };
    const state = drawReducer(stateWithFeatures, { type: 'REMOVE_FEATURE', payload: 'f1' });
    expect(state.features).toHaveLength(1);
    expect(state.features[0].id).toBe('f2');
    expect(state.selectedFeatureId).toBeNull();
  });

  it('REMOVE_FEATURE does not clear selection if a different feature is removed', () => {
    const f1 = makeFeature('f1');
    const f2 = makeFeature('f2');
    const stateWithFeatures = { ...initialDrawState, features: [f1, f2], selectedFeatureId: 'f2' };
    const state = drawReducer(stateWithFeatures, { type: 'REMOVE_FEATURE', payload: 'f1' });
    expect(state.selectedFeatureId).toBe('f2');
  });

  it('UPDATE_FEATURE partial-updates category and label', () => {
    const f1 = makeFeature('f1');
    const stateWithFeatures = { ...initialDrawState, features: [f1] };
    const state = drawReducer(stateWithFeatures, {
      type: 'UPDATE_FEATURE',
      payload: { id: 'f1', updates: { category: 'river', label: 'Test' } },
    });
    expect(state.features[0].category).toBe('river');
    expect(state.features[0].label).toBe('Test');
    expect(state.features[0].visible).toBe(true);
  });

  it('UPDATE_FEATURE toggles visibility', () => {
    const f1 = makeFeature('f1');
    const stateWithFeatures = { ...initialDrawState, features: [f1] };
    const state = drawReducer(stateWithFeatures, {
      type: 'UPDATE_FEATURE',
      payload: { id: 'f1', updates: { visible: false } },
    });
    expect(state.features[0].visible).toBe(false);
  });

  it('SET_DRAW_MODE sets mode', () => {
    const state = drawReducer(initialDrawState, { type: 'SET_DRAW_MODE', payload: 'polygon' });
    expect(state.drawMode).toBe('polygon');
  });

  it('SET_DRAW_MODE clears pendingCategory', () => {
    const state = drawReducer(
      { ...initialDrawState, drawMode: 'circle', pendingCategory: 'Roost' },
      { type: 'SET_DRAW_MODE', payload: 'select' },
    );
    expect(state.drawMode).toBe('select');
    expect(state.pendingCategory).toBeNull();
  });

  it('START_DRAWING sets mode + pendingCategory', () => {
    const state = drawReducer(initialDrawState, {
      type: 'START_DRAWING',
      payload: { mode: 'circle', category: 'Roost' },
    });
    expect(state.drawMode).toBe('circle');
    expect(state.pendingCategory).toBe('Roost');
  });

  it('SELECT_FEATURE sets selectedFeatureId', () => {
    const state = drawReducer(initialDrawState, { type: 'SELECT_FEATURE', payload: 'abc' });
    expect(state.selectedFeatureId).toBe('abc');
  });

  it('CLEAR_ALL resets to initial state', () => {
    const stateWithFeatures = {
      ...initialDrawState,
      features: [makeFeature('f1'), makeFeature('f2')],
      selectedFeatureId: 'f1',
      drawMode: 'polygon' as const,
    };
    const state = drawReducer(stateWithFeatures, { type: 'CLEAR_ALL' });
    expect(state.features).toHaveLength(0);
    expect(state.selectedFeatureId).toBeNull();
    expect(state.drawMode).toBe(initialDrawState.drawMode);
  });
});

describe('geometryKindForMode', () => {
  it('maps modes to geometry kinds', () => {
    expect(geometryKindForMode('point')).toBe('point');
    expect(geometryKindForMode('linestring')).toBe('linestring');
    expect(geometryKindForMode('polygon')).toBe('polygon');
    expect(geometryKindForMode('circle')).toBe('circle');
    expect(geometryKindForMode('select')).toBe('point');
  });
});