import { describe, it, expect, vi } from 'vitest';
import { createEngine } from './engine';
import { parseGeoJsonToFeatures } from './engine.fileSource';
import { DRAWN_SOURCE_ID } from './engine.dataStore';
import type { FileSourceDef } from './engine.fileSource.types';


function mockEngine() {
  const engine = createEngine();
  const actions = {
    addFeatureToMap: vi.fn(),
    removeFeatureFromMap: vi.fn(),
    setFeatureVisibility: vi.fn(),
    updateFeatureGeometry: vi.fn(),
    addResultLayer: vi.fn(),
    removeResultLayer: vi.fn(),
  };
  engine.setMapActions(actions as any);
  return { engine, actions };
}

const LIGHTS_DEF: FileSourceDef = {
  id: 'uploaded-lights',
  name: 'Street Lights',
  category: 'Lights',
};

const sampleGeoJSON = {
  type: 'FeatureCollection' as const,
  features: [
    {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [-3.6, 50.604] as [number, number] },
      properties: { height: 5, label: 'Lamp A' },
    },
    {
      type: 'Feature' as const,
      geometry: { type: 'Point' as const, coordinates: [-3.601, 50.605] as [number, number] },
      properties: { height: 10 },
    },
  ],
};

const UuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;


describe('parseGeoJsonToFeatures', () => {
  it('parses a FeatureCollection of Points', () => {
    const features = parseGeoJsonToFeatures(LIGHTS_DEF, sampleGeoJSON);
    expect(features).toHaveLength(2);

    for (const f of features) {
      expect(f.geometryKind).toBe('point');
      expect(f.category).toBe('Lights');
      expect(f.visible).toBe(true);
      expect(f.id).toMatch(UuidPattern);
      expect(f.label).toMatch(/Street Lights \d/);
    }

    expect(features[0]!.data).toEqual({ height: 5, label: 'Lamp A' });
    expect(features[1]!.data).toEqual({ height: 10 });
  });

  it('parses a single Feature (not wrapped in FeatureCollection)', () => {
    const fc = {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: {},
    };
    const features = parseGeoJsonToFeatures(LIGHTS_DEF, fc);
    expect(features).toHaveLength(1);
    expect(features[0]!.geometryKind).toBe('point');
  });

  it('assigns correct geometryKind for Polygon and LineString', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [0, 1]]] }, properties: {} },
        { type: 'Feature', geometry: { type: 'LineString', coordinates: [[0, 0], [1, 1]] }, properties: {} },
      ],
    };
    const features = parseGeoJsonToFeatures(LIGHTS_DEF, fc);
    expect(features[0]!.geometryKind).toBe('polygon');
    expect(features[1]!.geometryKind).toBe('linestring');
  });

  it('skips features without geometry', () => {
    const fc = {
      type: 'FeatureCollection',
      features: [
        { type: 'Feature', geometry: null, properties: {} },
        { type: 'Feature', geometry: { type: 'Point', coordinates: [1, 2] }, properties: {} },
      ],
    };
    const features = parseGeoJsonToFeatures(LIGHTS_DEF, fc);
    expect(features).toHaveLength(1);
  });

  it('generates unique UUIDs across multiple calls', () => {
    const a = parseGeoJsonToFeatures(LIGHTS_DEF, sampleGeoJSON);
    const b = parseGeoJsonToFeatures(LIGHTS_DEF, sampleGeoJSON);
    const allIds = new Set([...a.map((f) => f.id), ...b.map((f) => f.id)]);
    expect(allIds.size).toBe(4); // 2 + 2 unique
  });
});


describe('addFileSourceFeatures', () => {
  it('adds features to engine state and calls addFeatureToMap with correct shape', () => {
    const { engine, actions } = mockEngine();
    const features = engine.addFileSourceFeatures(LIGHTS_DEF, sampleGeoJSON);

    const snap = engine.getSnapshot();
    expect(snap.features.features).toHaveLength(2);
    expect(snap.features.features[0]!.category).toBe('Lights');

    expect(actions.addFeatureToMap).toHaveBeenCalledTimes(2);

    const [id, gj] = actions.addFeatureToMap.mock.calls[0];
    expect(id).toBe(features[0]!.id);
    expect(gj).toHaveProperty('id', features[0]!.id);
    expect(gj).toHaveProperty('type', 'Feature');
    expect(gj.geometry).toEqual({ type: 'Point', coordinates: [-3.6, 50.604] });
    expect(gj.properties).toMatchObject({
      height: 5,
      label: 'Lamp A',
      mode: 'point__Lights',
    });
  });

  it('injects the correct TerraDraw composite mode name', () => {
    const { engine, actions } = mockEngine();
    const fc = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [0, 0] as [number, number] },
        properties: {},
      }],
    };
    engine.addFileSourceFeatures(LIGHTS_DEF, fc);

    const [, gj] = actions.addFeatureToMap.mock.calls[0];
    expect(gj.properties.mode).toBe('point__Lights');
  });

  it('replaces old features on re-upload', () => {
    const { engine, actions } = mockEngine();

    const first = { type: 'FeatureCollection' as const, features: [sampleGeoJSON.features[0]!] };
    const f1 = engine.addFileSourceFeatures(LIGHTS_DEF, first);
    expect(engine.getSnapshot().features.features).toHaveLength(1);
    const oldId = f1[0]!.id;

    const second = { type: 'FeatureCollection' as const, features: [sampleGeoJSON.features[1]!] };
    const f2 = engine.addFileSourceFeatures(LIGHTS_DEF, second);

    const snap = engine.getSnapshot();
    expect(snap.features.features).toHaveLength(1);
    expect(snap.features.features[0]!.id).not.toBe(oldId);
    expect(snap.features.features[0]!.data).toEqual({ height: 10 });
  });

  it('tracks sources in dataStore', () => {
    const { engine } = mockEngine();
    engine.addFileSourceFeatures(LIGHTS_DEF, sampleGeoJSON);

    const sources = engine.dataStore.getSources();
    expect(sources).toHaveLength(2); // drawn + upload

    const upload = sources.find((s) => s.kind === 'upload');
    expect(upload).toBeDefined();
    expect(upload!.name).toBe('Street Lights');
    expect(upload!.id).toBe('uploaded-lights');
  });

  it('id is a UUID v4 (matches TerraDraw default IdStrategy)', () => {
    const { engine } = mockEngine();
    const fc = {
      type: 'FeatureCollection' as const,
      features: [{
        type: 'Feature' as const,
        geometry: { type: 'Point' as const, coordinates: [0, 0] as [number, number] },
        properties: {},
      }],
    };
    engine.addFileSourceFeatures(LIGHTS_DEF, fc);

    const f = engine.getSnapshot().features.features[0];
    expect(f!.id).toMatch(UuidPattern);
  });

  it('getSources includes drawn features', () => {
    const { engine } = mockEngine();
    engine.addFileSourceFeatures(LIGHTS_DEF, sampleGeoJSON);

    // add a drawn feature
    engine.addFeature({
      id: 'drawn-1',
      geometryKind: 'point',
      category: 'Custom',
      label: 'My point',
      visible: true,
      geojson: { type: 'Feature', geometry: { type: 'Point', coordinates: [0, 0] }, properties: {} } as any,
    });

    const sources = engine.dataStore.getSources();
    expect(sources).toHaveLength(2);

    const drawn = sources.find((s) => s.kind === 'drawn');
    expect(drawn).toBeDefined();
    expect(drawn!.id).toBe(DRAWN_SOURCE_ID);
    expect(drawn!.featureIds).toContain('drawn-1');

    const upload = sources.find((s) => s.kind === 'upload');
    expect(upload!.featureIds.length).toBe(2);
  });
});
