/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { EngineProvider } from './useEngine';
import { DataSourceProvider, useDataSources } from './providers/DataSourceProvider';
import { createEngine } from '../core';
import { DRAWN_SOURCE_ID } from '../core/engine.dataStore';

describe('DataSourceProvider', () => {
  function wrapper({ children }: { children: React.ReactNode }) {
    const engine = createEngine();
    return (
      <EngineProvider engine={engine}>
        <DataSourceProvider>
          {children}
        </DataSourceProvider>
      </EngineProvider>
    );
  }

  it('includes drawn features in drawnSource after addFeature', () => {
    const engine = createEngine();
    const wrapp = ({ children }: { children: React.ReactNode }) => (
      <EngineProvider engine={engine}>
        <DataSourceProvider>
          {children}
        </DataSourceProvider>
      </EngineProvider>
    );

    const { result } = renderHook(() => useDataSources(), { wrapper: wrapp });

    expect(result.current.drawnSource.id).toBe(DRAWN_SOURCE_ID);
    expect(result.current.drawnSource.featureIds).toEqual([]);

    act(() => {
      engine.addFeature({
        id: 'drawn-1',
        geometryKind: 'point',
        category: 'Test',
        label: 'My feature',
        visible: true,
        geojson: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} },
      });
    });

    expect(result.current.drawnSource.featureIds).toEqual(['drawn-1']);
  });

  it('does not assign uploaded feature IDs to drawnSource', () => {
    const engine = createEngine();
    const wrapp = ({ children }: { children: React.ReactNode }) => (
      <EngineProvider engine={engine}>
        <DataSourceProvider>
          {children}
        </DataSourceProvider>
      </EngineProvider>
    );

    const { result } = renderHook(() => useDataSources(), { wrapper: wrapp });

    act(() => {
      engine.addFileSourceFeatures(
        { id: 'upload-1', name: 'Test Upload', category: 'Uploaded' },
        {
          type: 'FeatureCollection',
          features: [{
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [1, 2] },
            properties: {},
          }],
        },
      );
    });

    // Uploaded features should appear as an upload source, not drawn
    expect(result.current.drawnSource.featureIds).toEqual([]);
    const uploadSource = result.current.sources.find((s) => s.kind === 'upload');
    expect(uploadSource).toBeDefined();
    expect(uploadSource!.featureIds.length).toBe(1);
  });

  it('recomputes sources when features change', () => {
    const engine = createEngine();
    const wrapp = ({ children }: { children: React.ReactNode }) => (
      <EngineProvider engine={engine}>
        <DataSourceProvider>
          {children}
        </DataSourceProvider>
      </EngineProvider>
    );

    const { result } = renderHook(() => useDataSources(), { wrapper: wrapp });

    // Initially no sources have features
    expect(result.current.drawnSource.featureIds).toEqual([]);

    act(() => {
      engine.addFeature({
        id: 'f1',
        geometryKind: 'polygon',
        category: 'Zone',
        label: 'Area 1',
        visible: true,
        geojson: { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1], [0, 0]]] }, properties: {} },
      });
    });

    expect(result.current.drawnSource.featureIds).toEqual(['f1']);

    act(() => {
      engine.removeFeature('f1');
    });

    expect(result.current.drawnSource.featureIds).toEqual([]);
  });
});
