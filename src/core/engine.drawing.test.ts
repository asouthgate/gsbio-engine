import { describe, it, expect, vi } from 'vitest';
import {
  createSimulationEngine,
  type DrawnFeature,
  type LngLat,
} from './index';

/** 
 * A helper to create a DrawnFeature with some default values and a valid GeoJSON geometry. 
 * The `over` argument can override any of the default properties.
 * 
 * @param id - A unique identifier for the feature.
 * @param kind - The geometry kind of the feature ('point', 'linestring', 'polygon', or 'circle').
 * @param over - An optional object to override default properties of the feature.
 * @returns A DrawnFeature object with the specified properties and a valid GeoJSON geometry.
 */
function feature(
  id: string,
  kind: DrawnFeature['geometryKind'],
  over: Partial<DrawnFeature> = {},
): DrawnFeature {
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
  } as DrawnFeature;
}

/** 
 * A helper to create a simulation engine with an initial feature.
 * 
 * @param initialFeature - The feature to add to the engine.
 * @returns An object containing the engine instance and map actions.
 */
function engineWith(initialFeature: DrawnFeature) {
  const engine = createSimulationEngine();
  engine.dispatchDraw({ type: 'ADD_FEATURE', payload: initialFeature });
  // Mock actions for the engine to interact with the map.
  const actions = {
    removeFeatureFromMap: vi.fn(),
    setFeatureVisibility: vi.fn(),
    updateFeatureGeometry: vi.fn(),
    addResultLayer: vi.fn(),
    removeResultLayer: vi.fn(),
  };
  engine.setMapActions(actions);
  return { engine, actions };
}

// A sample coordinate for testing point updates.
const PERTH: LngLat = { lng: 115.86, lat: -31.95 };

describe('updatePointPosition', () => {
  it('moves the point and pushes geometry to the map', () => {
    const { engine, actions } = engineWith(feature('p1', 'point'));
    engine.drawing.updatePointPosition('p1', PERTH);
    const f = engine.getSnapshot().draw.features[0];
    expect((f.geojson.geometry as GeoJSON.Point).coordinates).toEqual([PERTH.lng, PERTH.lat]);
    expect(f.geojson.id).toBe('p1');
    expect((f.geojson as { properties: { mode: string } }).properties.mode).toBe('point');
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
    expect(actions.updateFeatureGeometry).toHaveBeenCalledWith('p1', f.geojson);
  });

  it('no-ops on a non-point feature', () => {
    const { engine, actions } = engineWith(feature('l1', 'linestring'));
    engine.drawing.updatePointPosition('l1', PERTH);
    expect(actions.updateFeatureGeometry).not.toHaveBeenCalled();
  });
});

describe('updateCircle', () => {
  it('updates radius and regenerates the polygon approximation', () => {
    const { engine, actions } = engineWith(feature('c1', 'circle'));
    engine.drawing.updateCircle('c1', { radiusMeters: 250 });
    const f = engine.getSnapshot().draw.features[0];
    expect(f.circle?.radiusMeters).toBe(250);
    expect(f.circle?.center).toEqual({ lng: 0, lat: 0 });
    expect((f.geojson.geometry as GeoJSON.Polygon).coordinates[0]).toHaveLength(65);
    expect(f.geojson.id).toBe('c1');
    expect((f.geojson as { properties: { mode: string } }).properties.mode).toBe('circle');
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
  });

  it('updates center and regenerates the polygon approximation', () => {
    const { engine, actions } = engineWith(feature('c1', 'circle'));
    engine.drawing.updateCircle('c1', { center: PERTH });
    const f = engine.getSnapshot().draw.features[0];
    expect(f.circle?.center).toEqual(PERTH);
    expect(f.circle?.radiusMeters).toBe(100);
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
  });

  it('no-ops on a non-circle feature', () => {
    const { engine, actions } = engineWith(feature('p1', 'point'));
    engine.drawing.updateCircle('p1', { radiusMeters: 999 });
    expect(actions.updateFeatureGeometry).not.toHaveBeenCalled();
  });
});

describe('updateLineStringCoords', () => {
  it('replaces vertices and pushes geometry to the map', () => {
    const { engine, actions } = engineWith(feature('l1', 'linestring'));
    const coords: LngLat[] = [{ lng: 1, lat: 2 }, { lng: 3, lat: 4 }, { lng: 5, lat: 6 }];
    engine.drawing.updateLineStringCoords('l1', coords);
    const f = engine.getSnapshot().draw.features[0];
    expect((f.geojson.geometry as GeoJSON.LineString).coordinates).toEqual([
      [1, 2], [3, 4], [5, 6],
    ]);
    expect(f.geojson.id).toBe('l1');
    expect((f.geojson as { properties: { mode: string } }).properties.mode).toBe('linestring');
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
  });

  it('no-ops on a non-linestring feature', () => {
    const { engine, actions } = engineWith(feature('p1', 'point'));
    engine.drawing.updateLineStringCoords('p1', [PERTH]);
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
    engine.drawing.updatePolygonRing('pg1', ring);
    const f = engine.getSnapshot().draw.features[0];
    const coords = (f.geojson.geometry as GeoJSON.Polygon).coordinates[0];
    expect(coords).toHaveLength(4);
    expect(coords[0]).toEqual([0, 0]);
    expect(coords[3]).toEqual([0, 0]);
    expect(f.geojson.id).toBe('pg1');
    expect((f.geojson as { properties: { mode: string } }).properties.mode).toBe('polygon');
    expect(actions.updateFeatureGeometry).toHaveBeenCalledTimes(1);
  });

  it('no-ops on a non-polygon feature', () => {
    const { engine, actions } = engineWith(feature('p1', 'point'));
    engine.drawing.updatePolygonRing('p1', [PERTH]);
    expect(actions.updateFeatureGeometry).not.toHaveBeenCalled();
  });
});