import { describe, it, expect } from 'vitest';
import {
  averageRadiusMeters,
  centroid,
  circleToPolygon,
  destinationPoint,
  haversineDistanceMeters,
  lineStringToGeoJSONFeature,
  polygonRingToGeoJSONFeature,
  type LngLat,
} from './index';

const EXETER: LngLat = { lng: -3.5345, lat: 50.7236 };

describe('destinationPoint', () => {
  it('returns the start point when distance is 0', () => {
    const p = destinationPoint(EXETER, 0, 90);
    expect(p.lat).toBeCloseTo(EXETER.lat, 6);
    expect(p.lng).toBeCloseTo(EXETER.lng, 6);
  });

  it('moves ~1 km north over 1000 m at bearing 0', () => {
    const p = destinationPoint(EXETER, 1000, 0);
    expect(haversineDistanceMeters(EXETER, p)).toBeCloseTo(1000, 0);
    expect(p.lat).toBeGreaterThan(EXETER.lat);
  });
});

describe('circleToPolygon', () => {
  it('produces a closed Polygon feature with `segments+1` vertices', () => {
    const f = circleToPolygon(EXETER, 500, 8);
    expect(f.geometry.type).toBe('Polygon');
    const ring = (f.geometry as GeoJSON.Polygon).coordinates[0];
    expect(ring).toHaveLength(9);
    expect(ring[0]).toEqual(ring[8]);
  });

  it('every vertex lies within ~1 mm of the requested radius', () => {
    const radius = 1234.5;
    const f = circleToPolygon(EXETER, radius, 64);
    const ring = (f.geometry as GeoJSON.Polygon).coordinates[0];
    for (const [lng, lat] of ring) {
      const d = haversineDistanceMeters(EXETER, { lng, lat });
      expect(d).toBeGreaterThan(radius - 1);
      expect(d).toBeLessThan(radius + 1);
    }
  });
});

describe('lineStringToGeoJSONFeature', () => {
  it('builds a LineString feature preserving coordinate order', () => {
    const coords: LngLat[] = [
      { lng: -1, lat: 50 },
      { lng: -2, lat: 51 },
    ];
    const f = lineStringToGeoJSONFeature(coords);
    expect(f.geometry.type).toBe('LineString');
    expect((f.geometry as GeoJSON.LineString).coordinates).toEqual([
      [-1, 50],
      [-2, 51],
    ]);
  });
});

describe('polygonRingToGeoJSONFeature', () => {
  it('closes an open ring by repeating the first vertex', () => {
    const ring: LngLat[] = [
      { lng: 0, lat: 0 },
      { lng: 1, lat: 0 },
      { lng: 1, lat: 1 },
    ];
    const f = polygonRingToGeoJSONFeature(ring);
    expect(f.geometry.type).toBe('Polygon');
    const coords = (f.geometry as GeoJSON.Polygon).coordinates[0];
    expect(coords).toHaveLength(4);
    expect(coords[0]).toEqual(coords[3]);
  });

  it('leaves an already-closed ring alone', () => {
    const ring: LngLat[] = [
      { lng: 0, lat: 0 },
      { lng: 1, lat: 0 },
      { lng: 1, lat: 1 },
      { lng: 0, lat: 0 },
    ];
    const f = polygonRingToGeoJSONFeature(ring);
    const coords = (f.geometry as GeoJSON.Polygon).coordinates[0];
    expect(coords).toHaveLength(4);
  });
});

describe('centroid', () => {
  it('returns the mean position of all vertices', () => {
    const ring: LngLat[] = [
      { lng: 0, lat: 0 },
      { lng: 10, lat: 0 },
      { lng: 10, lat: 4 },
      { lng: 0, lat: 4 },
    ];
    expect(centroid(ring)).toEqual({ lng: 5, lat: 2 });
  });

  it('ignores a closing duplicate vertex', () => {
    const open = [{ lng: 0, lat: 0 }, { lng: 10, lat: 0 }, { lng: 10, lat: 4 }, { lng: 0, lat: 4 }];
    const closed = [...open, { lng: 0, lat: 0 }];
    expect(centroid(closed)).toEqual(centroid(open));
  });

  it('returns 0,0 for an empty ring', () => {
    expect(centroid([])).toEqual({ lng: 0, lat: 0 });
  });
});

describe('averageRadiusMeters', () => {
  it('matches the requested radius for a circleToPolygon output', () => {
    const radius = 500;
    const f = circleToPolygon(EXETER, radius, 64);
    const ring = (f.geometry as GeoJSON.Polygon).coordinates[0].map(([lng, lat]) => ({ lng, lat }));
    const avg = averageRadiusMeters(EXETER, ring);
    expect(avg).toBeGreaterThan(radius - 1);
    expect(avg).toBeLessThan(radius + 1);
  });

  it('returns 0 for an empty ring', () => {
    expect(averageRadiusMeters(EXETER, [])).toBe(0);
  });
});