/**
 * @vitest-environment jsdom
 */
import { describe, it, expect} from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { EngineProvider, useDraw, useModel } from './useEngine';
import { createSimulationEngine } from '../core';

describe('Engine Hooks', () => {
  // Use a factory function to ensure a clean engine for every test
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <EngineProvider engine={createSimulationEngine()}>
      {children}
    </EngineProvider>
  );

  it('useDraw provides initial state and actions', () => {
    const { result } = renderHook(() => useDraw(), { wrapper });
    // console.log('HOOK RESULT:', JSON.stringify(result.current.state, null, 2));
    expect(result.current.state).toBeDefined();
    expect(result.current.state.drawMode).toBe('select');
  });

  it('updates state reactively when the engine updates', () => {
    const { result } = renderHook(() => useDraw(), { wrapper });
    // Act: Manually trigger a change in the engine
    act(() => {
      result.current.startDrawing('circle', 'hazard_zone');
    });
    expect(result.current.state.drawMode).toBe('circle');
  });

  it('correctly dispatches actions to the engine', () => {
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
    // console.log('HOOK RESULT:', JSON.stringify(result.current.state, null, 2));
    // console.log('ENGINE STATE:', JSON.stringify(engine.getSnapshot().model, null, 2));
    // console.log('MODEL STATE:', JSON.stringify(engine.models.list(), null, 2));
    expect(result.current.state.modelId).toBe('model_a');  // still a
  });

  it('maintains independent state per provider', () => {
    // This tests that multiple instances don't cross-talk
    const customWrapper = ({ children }: { children: React.ReactNode }) => (
      <EngineProvider engine={createSimulationEngine()}>{children}</EngineProvider>
    );

    const hook1 = renderHook(() => useDraw(), { wrapper: customWrapper });
    const hook2 = renderHook(() => useDraw(), { wrapper: customWrapper });

    act(() => {
      hook1.result.current.startDrawing('line', 'test');
    });

    // Assert: hook1 changed, but hook2 should still be in 'select' mode
    expect(hook1.result.current.state.drawMode).toBe('line');
    expect(hook2.result.current.state.drawMode).toBe('select');
  });
});