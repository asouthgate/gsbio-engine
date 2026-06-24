/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
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
});