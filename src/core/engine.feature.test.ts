import { describe, it, expect, vi } from 'vitest';
import {
  createEngine,
  type DataFeature,
  type LngLat,
} from './index';

function feature(
  id: string,
  kind: DataFeature['geometryKind'],
  over: Partial<DataFeature> = {},
): DataFeature {
  return {
    id,
    geometryKind: kind,
    category: '',
    label: '',
    visible: true,
    geojson: {
      type: 'Feature',
      id,
      geometry:
        kind === 'point'
          ? { type: 'Point', coordinates: [0, 0] }
          : kind === 'linestring'
            ? { type: 'LineString', coordinates: [[0, 0], [1, 1]] }
            : { type: 'Polygon', coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      properties: { mode: kind === 'linestring' ? 'linestring' : kind },
    },
    ...(kind === 'circle'
      ? { circle: { center: { lng: 0, lat: 0 }, radiusMeters: 100 } }
      : {}),
    ...over,
  } as DataFeature;
}

function engineWith(initialFeature: DataFeature) {
  const engine = createEngine();
  engine.addFeature(initialFeature);
    const actions = {
    addFeatureToMap: vi.fn(),
    removeFeatureFromMap: vi.fn(),
    setFeatureVisibility: vi.fn(),
    updateFeatureGeometry: vi.fn(),
    addResultLayer: vi.fn(),
    removeResultLayer: vi.fn(),
  };
  engine.setMapActions(actions);
  return { engine, actions };
}

const PERTH: LngLat = { lng: 115.86, lat: -31.95 };

describe('updatePointPosition', () => {
  it('moves the point and pushes geometry to the map', () => {
    const { engine, actions } = engineWith(feature('p1', 'point'));
    engine.updatePointPosition('p1', PERTH);
    const f = engine.getSnapshot().features.features[0];
    expect((f.geojson.geometry as GeoJSON.Point).coordinates).toEqual([PERTH.lng, PERTH.lat]);
    expect(f.geojson.id).toBe('p1');
    expect((f.geojson as any).properties.mode).toBe('point');
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
    expect(actions.updateFeatureGeometry).toHaveBeenCalledWith('p1', f.geojson);
  });

  it('no-ops on a non-point feature', () => {
    const { engine, actions } = engineWith(feature('l1', 'linestring'));
    engine.updatePointPosition('l1', PERTH);
    expect(actions.updateFeatureGeometry).not.toHaveBeenCalled();
  });
});

describe('updateCircle', () => {
  it('updates radius and regenerates the polygon approximation', () => {
    const { engine, actions } = engineWith(feature('c1', 'circle'));
    engine.updateCircle('c1', { radiusMeters: 250 });
    const f = engine.getSnapshot().features.features[0];
    expect(f.circle?.radiusMeters).toBe(250);
    expect(f.circle?.center).toEqual({ lng: 0, lat: 0 });
    expect((f.geojson.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(65);
    expect(f.geojson.id).toBe('c1');
    expect((f.geojson as any).properties.mode).toBe('circle');
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
  });

  it('updates center and regenerates the polygon approximation', () => {
    const { engine, actions } = engineWith(feature('c1', 'circle'));
    engine.updateCircle('c1', { center: PERTH });
    const f = engine.getSnapshot().features.features[0];
    expect(f.circle?.center).toEqual(PERTH);
    expect(f.circle?.radiusMeters).toBe(100);
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
  });

  it('no-ops on a non-circle feature', () => {
    const { engine, actions } = engineWith(feature('p1', 'point'));
    engine.updateCircle('p1', { radiusMeters: 999 });
    expect(actions.updateFeatureGeometry).not.toHaveBeenCalled();
  });
});

describe('updateLineStringCoords', () => {
  it('replaces vertices and pushes geometry to the map', () => {
    const { engine, actions } = engineWith(feature('l1', 'linestring'));
    const coords: LngLat[] = [{ lng: 1, lat: 2 }, { lng: 3, lat: 4 }, { lng: 5, lat: 6 }];
    engine.updateLineStringCoords('l1', coords);
    const f = engine.getSnapshot().features.features[0];
    expect((f.geojson.geometry as GeoJSON.LineString).coordinates).toEqual([
      [1, 2], [3, 4], [5, 6],
    ]);
    expect(f.geojson.id).toBe('l1');
    expect((f.geojson as any).properties.mode).toBe('linestring');
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
  });

  it('no-ops on a non-linestring feature', () => {
    const { engine, actions } = engineWith(feature('p1', 'point'));
    engine.updateLineStringCoords('p1', [PERTH]);
    expect(actions.updateFeatureGeometry).not.toHaveBeenCalled();
  });
});

describe('updatePolygonRing', () => {
  it('replaces the outer ring and re-closes if needed', () => {
    const { engine, actions } = engineWith(feature('pg1', 'polygon'));
    const ring: LngLat[] = [
      { lng: 0, lat: 0 },
      { lng: 2, lat: 0 },
      { lng: 2, lat: 2 },
    ];
    engine.updatePolygonRing('pg1', ring);
    const f = engine.getSnapshot().features.features[0];
    const coords = (f.geojson.geometry as GeoJSON.Polygon).coordinates[0];
    expect(coords).toHaveLength(4);
    expect(coords[0]).toEqual([0, 0]);
    expect(coords[3]).toEqual([0, 0]);
    expect(f.geojson.id).toBe('pg1');
    expect((f.geojson as any).properties.mode).toBe('polygon');
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
  });

  it('no-ops on a non-polygon feature', () => {
    const { engine, actions } = engineWith(feature('p1', 'point'));
    engine.updatePolygonRing('p1', [PERTH]);
    expect(actions.updateFeatureGeometry).not.toHaveBeenCalled();
  });
});
