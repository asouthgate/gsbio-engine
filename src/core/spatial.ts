export interface LngLat {
  lng: number;
  lat: number;
}

export interface Pixel {
  x: number;
  y: number;
}

export type ProjectFn = (lngLat: LngLat) => Pixel;
export type UnprojectFn = (pixel: Pixel) => LngLat;

// Mean Earth radius, WGS84, in metres.
export const WGS84_EARTH_RADIUS_M = 6378137;

// Standard default precision for renderers
export const COORDINATE_PRECISION = 9;

function roundLngLat(p: LngLat): LngLat {
  const f = 10 ** COORDINATE_PRECISION;
  return {
    lng: Math.round(p.lng * f) / f,
    lat: Math.round(p.lat * f) / f,
  };
}

export function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

export function toDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/** Great-circle distance between two lng/lat points, in metres. */
export function haversineDistanceMeters(a: LngLat, b: LngLat): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * WGS84_EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/**
 * Check if a point is inside a polygon using ray-casting.
 */
export function pointInPolygon(point: LngLat, ring: LngLat[]): boolean {
  if (ring.length < 3) return false;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i].lng;
    const yi = ring[i].lat;
    const xj = ring[j].lng;
    const yj = ring[j].lat;
    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

/**
 * Great-circle destination point given a start, distance in metres, and
 * initial bearing in degrees. Used to approximate a circle on the sphere.
 */
export function destinationPoint(
  start: LngLat,
  distanceMeters: number,
  bearingDeg: number,
): LngLat {
  const R = WGS84_EARTH_RADIUS_M;
  const brng = toRadians(bearingDeg);
  const lat1 = toRadians(start.lat);
  const lng1 = toRadians(start.lng);
  const d = distanceMeters / R;
  const sinLat2 = Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(brng);
  const lat2 = Math.asin(sinLat2);
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * sinLat2,
    );
  return roundLngLat({ lng: toDegrees(lng2), lat: toDegrees(lat2) });
}

/**
 * Build a GeoJSON `Polygon` feature approximating a circle on the Earth's
 * surface: `segments` points spaced at `radiusMeters` along great-circle
 * bearings from `center`. Suitable for storage + rendering; the semantic
 * truth (`center` + `radiusMeters`) lives on `DataFeature.circle`.
 */
export function circleToPolygon(
  center: LngLat,
  radiusMeters: number,
  segments = 64,
): GeoJSON.Feature {
  const ring: [number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const bearing = (i * 360) / segments;
    const p = destinationPoint(center, radiusMeters, bearing);
    ring.push([p.lng, p.lat]);
  }
  ring.push(ring[0]); // close the ring
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [ring] },
    properties: {},
  };
}

/**
 * Arithmetic centroid of a ring (mean lng, mean lat). Skips the closing
 * duplicate vertex if present. Used to recover a circle's centre after the
 * polygon approximation has been translated/scaled by TerraDraw select mode.
 */
export function centroid(ring: LngLat[]): LngLat {
  if (ring.length === 0) return { lng: 0, lat: 0 };
  let v = ring;
  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first.lng === last.lng && first.lat === last.lat) v = ring.slice(0, -1);
  }
  let lngSum = 0;
  let latSum = 0;
  for (const p of v) {
    lngSum += p.lng;
    latSum += p.lat;
  }
  return { lng: lngSum / v.length, lat: latSum / v.length };
}

/**
 * Average great-circle distance from `center` to each vertex of `ring`
 * (skipping the closing duplicate). Used to recover a circle's radius after
 * the polygon approximation has been scaled on the map.
 */
export function averageRadiusMeters(center: LngLat, ring: LngLat[]): number {
  let v = ring;
  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first.lng === last.lng && first.lat === last.lat) v = ring.slice(0, -1);
  }
  if (v.length === 0) return 0;
  let sum = 0;
  for (const p of v) sum += haversineDistanceMeters(center, p);
  return sum / v.length;
}

/** Build a GeoJSON `LineString` Feature from an array of `LngLat` points. */
export function lineStringToGeoJSONFeature(coords: LngLat[]): GeoJSON.Feature {
  return {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: coords.map((c) => {
        const r = roundLngLat(c);
        return [r.lng, r.lat];
      }),
    },
    properties: {},
  };
}

/**
 * Build a GeoJSON `Polygon` Feature from a single ring of `LngLat` points.
 * Closes the ring by repeating the first vertex if not already closed.
 */
export function polygonRingToGeoJSONFeature(ring: LngLat[]): GeoJSON.Feature {
  const coords = ring.map((c) => {
    const r = roundLngLat(c);
    return [r.lng, r.lat] as [number, number];
  });
  if (coords.length > 0) {
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      coords.push([first[0], first[1]]);
    }
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  };
}

/**
 * CoordinateService wraps a projection function pair (provided by the active
 * renderer / map) so the render side and the analysis side share one source of
 * truth for coordinate translation.
 */
export class CoordinateService {
  constructor(
    private readonly project: ProjectFn,
    private readonly unproject: UnprojectFn,
  ) {}

  lngLatToPixel(lngLat: LngLat): Pixel {
    return this.project(lngLat);
  }

  pixelToLngLat(pixel: Pixel): LngLat {
    return this.unproject(pixel);
  }

  pointInPolygon(point: LngLat, ring: LngLat[]): boolean {
    return pointInPolygon(point, ring);
  }
}