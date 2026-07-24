import { Buffer } from 'node:buffer';

export interface CircleSpec {
  id: string;
  center: { lng: number; lat: number };
  radiusMeters: number;
}

const EARTH_R_M = 6_371_000;
const TILE_SIZE = 256;

function haversineM(
  a: { lng: number; lat: number },
  b: { lng: number; lat: number },
): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = dLng * Math.cos((lat1 + lat2) / 2);
  const y = dLat;
  return Math.sqrt(x * x + y * y) * EARTH_R_M;
}

function tileCenter(z: number, x: number, y: number): { lng: number; lat: number } {
  const n = 2 ** z;
  const lng = ((x + 0.5) / n) * 360 - 180;
  const lat =
    ((Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 0.5)) / n))) * 180) / Math.PI);
  return { lng, lat };
}

export function shadeTileRgba(
  circles: CircleSpec[],
  z: number,
  x: number,
  y: number,
): Buffer {
  const pixels = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
  if (circles.length === 0) return pixels;

  const center = tileCenter(z, x, y);
  let bestT = -1;
  for (const c of circles) {
    const dist = haversineM(center, c.center);
    if (dist > c.radiusMeters) continue;
    const t = 1 - dist / c.radiusMeters;
    if (t > bestT) bestT = t;
  }

  const r = bestT >= 0 ? 255 : 0;
  const g = bestT >= 0 ? Math.round(180 * bestT + 40) : 0;
  const b = bestT >= 0 ? Math.round(40 * bestT) : 0;
  const a = bestT >= 0 ? Math.round(255 * bestT * bestT) : 0;

  for (let i = 0; i < TILE_SIZE * TILE_SIZE * 4; i += 4) {
    pixels[i + 0] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = a;
  }
  return pixels;
}
