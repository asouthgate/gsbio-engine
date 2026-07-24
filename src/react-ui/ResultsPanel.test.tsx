/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EngineProvider } from '../react';
import { ResultsPanel } from './ResultsPanel';
import { createEngine } from '../core';
import type { SimulationEngine, RunResultLayers } from '../core';

function setupEngine(engine: SimulationEngine) {
  engine.registerModel({ id: 'test-model', name: 'Test', params: [] });
  engine.setModel('test-model');
}

function makeSucceededRunWithLayers(engine: SimulationEngine, runId: string, layerCount: number): void {
  const layers = Array.from({ length: layerCount }, (_, i) => ({
    id: `layer-${i}`,
    envelope: { kind: 'image' as const, url: `http://example.com/layer-${i}.png`, bounds: [0, 0, 1, 1] as [number, number, number, number] },
  }));
  const result: RunResultLayers = { layers };

  const record = {
    runId,
    modelId: 'test-model',
    params: {},
    status: 'succeeded' as const,
    result,
    error: null,
    progress: null,
    startedAt: Date.now() - 5000,
    finishedAt: Date.now(),
    log: [{ ts: Date.now(), level: 'info' as const, message: 'completed' }],
    layerIds: layers.map((l) => l.id),
    visibleLayerIds: [],
    visible: false,
  };

  // @ts-expect-error accessing private state for test setup
  const prevHistory = engine._state.run.history;
  // @ts-expect-error
  engine._state.run = { current: null, history: [record, ...prevHistory] };
  // @ts-expect-error
  engine.emit();
}

describe('ResultsPanel download', () => {
  it('renders download button when onDownload is provided and a run succeeded with layers', () => {
    const engine = createEngine();
    setupEngine(engine);
    makeSucceededRunWithLayers(engine, 'run-1', 2);

    const onDownload = vi.fn();
    render(
      <EngineProvider engine={engine}>
        <ResultsPanel onDownload={onDownload} />
      </EngineProvider>,
    );

    const btn = screen.getByText('Download');
    expect(btn).toBeDefined();
    expect(btn.tagName).toBe('BUTTON');
  });

  it('does not render download button when onDownload is omitted', () => {
    const engine = createEngine();
    setupEngine(engine);
    makeSucceededRunWithLayers(engine, 'run-1', 1);

    render(
      <EngineProvider engine={engine}>
        <ResultsPanel />
      </EngineProvider>,
    );

    expect(screen.queryByText('Download')).toBeNull();
  });

  it('does not render download button for failed runs', () => {
    const engine = createEngine();
    setupEngine(engine);

    const record = {
      runId: 'run-fail',
      modelId: 'test-model',
      params: {},
      status: 'failed' as const,
      result: null,
      error: 'something broke',
      progress: null,
      startedAt: Date.now() - 1000,
      finishedAt: Date.now(),
      log: [],
      layerIds: [],
      visibleLayerIds: [],
      visible: false,
    };
    // @ts-expect-error
    engine._state.run = { current: null, history: [record] };
    // @ts-expect-error
    engine.emit();

    const onDownload = vi.fn();
    render(
      <EngineProvider engine={engine}>
        <ResultsPanel onDownload={onDownload} />
      </EngineProvider>,
    );

    expect(screen.queryByText('Download')).toBeNull();
  });

  it('calls onDownload with the correct runId on click', () => {
    const engine = createEngine();
    setupEngine(engine);
    makeSucceededRunWithLayers(engine, 'run-abc', 1);

    const onDownload = vi.fn();
    render(
      <EngineProvider engine={engine}>
        <ResultsPanel onDownload={onDownload} />
      </EngineProvider>,
    );

    fireEvent.click(screen.getByText('Download'));
    expect(onDownload).toHaveBeenCalledTimes(1);
    expect(onDownload).toHaveBeenCalledWith('run-abc');
  });

  it('renders download for each succeeded run with layers in history', () => {
    const engine = createEngine();
    setupEngine(engine);
    makeSucceededRunWithLayers(engine, 'run-a', 1);
    makeSucceededRunWithLayers(engine, 'run-b', 1);

    const onDownload = vi.fn();
    render(
      <EngineProvider engine={engine}>
        <ResultsPanel onDownload={onDownload} />
      </EngineProvider>,
    );

    const buttons = screen.getAllByText('Download');
    expect(buttons).toHaveLength(2);
  });
});
