import { describe, it, expect, vi } from 'vitest';
import { createSimulationEngine } from './engine';
import { parseCsvToFeatures, parseGeoJsonToFeatures } from './engine.fileSource';
import type { FileSourceDef } from './engine.fileSource.types';


function mockEngine() {
  const engine = createSimulationEngine();
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
  format: 'geojson',
  category: 'Lights',
};

const LIGHTS_CSV_DEF: FileSourceDef = {
  id: 'test-csv',
  name: 'Test CSV',
  format: 'csv',
  sourceCrs: 'EPSG:27700',
  targetCrs: 'EPSG:4326',
  csvMapping: { xColumn: 'x', yColumn: 'y', propertyColumns: ['height'] },
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

describe('parseCsvToFeatures', () => {
  it('parses a CSV with x,y,property columns into point DataFeatures', () => {
    const csv = 'x,y,height\n10,20,5\n30,40,12';
    const features = parseCsvToFeatures(LIGHTS_CSV_DEF, csv);

    expect(features).toHaveLength(2);
    expect(features[0]!.geometryKind).toBe('point');
    expect(features[0]!.category).toBe('Lights');
    expect(features[0]!.visible).toBe(true);
    expect((features[0]!.geojson.geometry as GeoJSON.Point).coordinates).toEqual([10, 20]);
    expect(features[0]!.data).toEqual({ height: 5 });
  });

  it('applies coordTransform to convert projected coords to WGS84', () => {
    const csv = 'e,n,z\n286000,79000,3';
    const def: FileSourceDef = {
      id: 'bng',
      name: 'BNG',
      format: 'csv',
      csvMapping: { xColumn: 'e', yColumn: 'n', propertyColumns: ['z'] },
      category: 'Pts',
    };
    // Simulate BNG → WGS84: easting=286000,northing=79000 near Dartmoor
    const transform = (e: number, n: number): [number, number] => [e / 100000, n / 100000];
    const features = parseCsvToFeatures(def, csv, transform);
    expect(features[0]!.geojson.geometry).toEqual({ type: 'Point', coordinates: [2.86, 0.79] });
  });

  it('returns empty array when x-column is missing', () => {
    const csv = 'northing,height\n20,5';
    expect(parseCsvToFeatures(LIGHTS_CSV_DEF, csv)).toEqual([]);
  });

  it('returns empty array for header-only CSV', () => {
    expect(parseCsvToFeatures(LIGHTS_CSV_DEF, 'x,y,height')).toEqual([]);
  });

  it('skips rows with NaN coordinates', () => {
    const csv = 'x,y,height\nbad,20,5\n30,40,12';
    const features = parseCsvToFeatures(LIGHTS_CSV_DEF, csv);
    expect(features).toHaveLength(1);
    expect(features[0]!.data).toEqual({ height: 12 });
  });
});

// ---------------------------------------------------------------------------
// parseGeoJsonToFeatures
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// addFileSourceFeatures – engine integration
// ---------------------------------------------------------------------------

describe('addFileSourceFeatures', () => {
  it('adds features to engine state and calls addFeatureToMap with correct shape', () => {
    const { engine, actions } = mockEngine();
    const features = parseGeoJsonToFeatures(LIGHTS_DEF, sampleGeoJSON);

    engine.addFileSourceFeatures(LIGHTS_DEF, features);

    // state – features
    const snap = engine.getSnapshot();
    expect(snap.features.features).toHaveLength(2);
    expect(snap.features.features[0]!.category).toBe('Lights');

    // state – fileSources
    expect(snap.fileSources).toHaveLength(1);
    expect(snap.fileSources[0]!.sourceId).toBe('uploaded-lights');
    expect(snap.fileSources[0]!.name).toBe('Street Lights');
    expect(snap.fileSources[0]!.featureIds).toEqual(features.map((f) => f.id));

    // mapActions – addFeatureToMap called for each feature
    expect(actions.addFeatureToMap).toHaveBeenCalledTimes(2);

    // first call payload shape
    const [id, gj] = actions.addFeatureToMap.mock.calls[0];
    expect(id).toBe(features[0]!.id);
    expect(gj).toHaveProperty('id', features[0]!.id);
    expect(gj).toHaveProperty('type', 'Feature');
    expect(gj.geometry).toEqual({ type: 'Point', coordinates: [-3.6, 50.604] });
    expect(gj.properties).toMatchObject({
      height: 5,
      label: 'Lamp A',
      mode: 'point__Lights',      // composite mode name
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
    const features = parseGeoJsonToFeatures(LIGHTS_DEF, fc);
    engine.addFileSourceFeatures(LIGHTS_DEF, features);

    const [, gj] = actions.addFeatureToMap.mock.calls[0];
    expect(gj.properties.mode).toBe('point__Lights');
  });

  it('replaces old features on re-upload', () => {
    const { engine, actions } = mockEngine();

    // first upload
    const first = [{ type: 'FeatureCollection' as const, features: [sampleGeoJSON.features[0]!] }];
    const f1 = parseGeoJsonToFeatures(LIGHTS_DEF, first[0]!);
    engine.addFileSourceFeatures(LIGHTS_DEF, f1);
    expect(engine.getSnapshot().features.features).toHaveLength(1);
    const oldId = f1[0]!.id;

    // re-upload with new data
    const second = [{ type: 'FeatureCollection' as const, features: [sampleGeoJSON.features[1]!] }];
    const f2 = parseGeoJsonToFeatures(LIGHTS_DEF, second[0]!);
    engine.addFileSourceFeatures(LIGHTS_DEF, f2);

    const snap = engine.getSnapshot();
    expect(snap.features.features).toHaveLength(1);
    expect(snap.features.features[0]!.id).not.toBe(oldId);         // old removed
    expect(snap.features.features[0]!.data).toEqual({ height: 10 }); // new data
    expect(snap.fileSources[0]!.featureIds).toEqual([f2[0]!.id]);
  });

  it('registers a data source on engine.dataSources', () => {
    const { engine } = mockEngine();
    const features = parseGeoJsonToFeatures(LIGHTS_DEF, sampleGeoJSON);
    engine.addFileSourceFeatures(LIGHTS_DEF, features);

    const ds = engine.dataSources.get('uploaded-lights');
    expect(ds).toBeDefined();
    expect(ds!.kind).toBe('upload');
    expect(ds!.name).toBe('Street Lights');
    expect(ds!.featureIds).toEqual(features.map((f) => f.id));
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
    const features = parseGeoJsonToFeatures(LIGHTS_DEF, fc);
    engine.addFileSourceFeatures(LIGHTS_DEF, features);

    const f = engine.getSnapshot().features.features[0];
    expect(f!.id).toMatch(UuidPattern);
  });
});
