/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { EngineProvider } from '../react';
import { FeaturePanel } from './FeaturePanel';
import { createEngine } from '../core';
import type { SimulationEngine, DataFeature } from '../core';

function setupEngine(engine: SimulationEngine) {
  engine.registerModel({ id: 'test-model', name: 'Test', params: [] });
  engine.setModel('test-model');
}

function makeFeature(overrides: Partial<DataFeature> = {}): DataFeature {
  return {
    id: 'f1',
    geometryKind: 'polygon',
    category: 'Building',
    label: 'Block A',
    visible: true,
    geojson: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [] }, properties: {} },
    data: { height: 10 },
    ...overrides,
  };
}

describe('FeaturePanel', () => {
  it('renders features and edits declared data fields via the resolver', () => {
    const engine = createEngine();
    setupEngine(engine);
    engine.addFeature(makeFeature());

    render(
      <EngineProvider engine={engine}>
        <FeaturePanel
          dataFields={(f) =>
            f.category === 'Building'
              ? [{ key: 'height', label: 'Height (m)', type: 'number', min: 0, max: 100, step: 1 }]
              : []
          }
        />
      </EngineProvider>,
    );

    expect(screen.getByText('Building')).toBeDefined();
    const input = screen.getByDisplayValue('10') as HTMLInputElement;
    expect(input).toBeDefined();

    fireEvent.change(input, { target: { value: '42' } });
    expect((engine.getSnapshot().features.features[0]!.data as Record<string, unknown>).height).toBe(42);
  });

  it('renders no fields when the resolver returns an empty list', () => {
    const engine = createEngine();
    setupEngine(engine);
    engine.addFeature(makeFeature({ category: 'River', data: undefined }));

    render(
      <EngineProvider engine={engine}>
        <FeaturePanel dataFields={() => []} />
      </EngineProvider>,
    );

    expect(screen.queryByText('Height (m)')).toBeNull();
  });
});
