/**
 * @vitest-environment jsdom
 */
import { describe, it, expect} from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { EngineProvider, useFeatures, useModel } from './useEngine';
import { createSimulationEngine } from '../core';

describe('Engine Hooks', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <EngineProvider engine={createSimulationEngine()}>
      {children}
    </EngineProvider>
  );

  it('useFeatures provides initial state and actions', () => {
    const { result } = renderHook(() => useFeatures(), { wrapper });
    expect(result.current.state).toBeDefined();
    expect(result.current.state.features).toEqual([]);
    expect(result.current.state.selectedFeatureId).toBeNull();
  });

  it('dispatches feature actions', () => {
    const { result } = renderHook(() => useFeatures(), { wrapper });
    act(() => {
      result.current.dispatch({
        type: 'ADD_FEATURE',
        payload: {
          id: 'f1',
          geometryKind: 'point',
          category: '',
          label: '',
          visible: true,
          geojson: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
        },
      });
    });
    expect(result.current.state.features).toHaveLength(1);
    expect(result.current.state.features[0].id).toBe('f1');
  });

  it('correctly dispatches model actions to the engine', () => {
    const engine = createSimulationEngine();
    engine.registerModel({ id: 'model_a', name: 'Test Model', params: [] });
    const wrapper = ({ children }: { children: React.ReactNode }) => (
        <EngineProvider engine={engine}>{children}</EngineProvider>
    );
    const { result } = renderHook(() => useModel(), { wrapper });
    act(() => {
        result.current.dispatch({ type: 'SET_MODEL', payload: 'model_a' });
    });
    expect(result.current.state.modelId).toBe('model_a');
    act(() => {
        result.current.dispatch({ type: 'SET_MODEL', payload: 'model_b' });
    });
    expect(result.current.state.modelId).toBe('model_a');
  });

  it('maintains independent state per provider', () => {
    const customWrapper = ({ children }: { children: React.ReactNode }) => (
      <EngineProvider engine={createSimulationEngine()}>{children}</EngineProvider>
    );

    const hook1 = renderHook(() => useFeatures(), { wrapper: customWrapper });
    const hook2 = renderHook(() => useFeatures(), { wrapper: customWrapper });

    act(() => {
      hook1.result.current.dispatch({
        type: 'ADD_FEATURE',
        payload: {
          id: 'f1',
          geometryKind: 'linestring',
          category: '',
          label: '',
          visible: true,
          geojson: { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} },
        },
      });
    });

    expect(hook1.result.current.state.features).toHaveLength(1);
    expect(hook2.result.current.state.features).toHaveLength(0);
  });
});
