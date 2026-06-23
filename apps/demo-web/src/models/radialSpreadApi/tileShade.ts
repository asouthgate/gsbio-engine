/**
 * Radial Spread (API) — per-tile rasteriser (used by the mock API server).
 *
 * Shades a 256×256 XYZ raster tile by the same distance-shaded warm ramp as
 * the WASM kernel (`apps/demo-web/src/wasm/spread.ts`), so the two
 * archetypes are visually identical. For each sampled block, find the
 * nearest drawn circle (by great-circle distance in metres); if inside its
 * radius, shade by `t = 1 − dist/radius` (1 at the centre → 0 at the edge),
 * otherwise transparent. Returns a PNG `Buffer` the mock server streams to
 * the renderer.
 */

export interface CircleSpec {
  id: string;
  center: { lng: number; lat: number };
  radiusMeters: number;
}

const TILE_SIZE = 256;
const EARTH_R_M = 6_371_000;

/** Great-circle distance in metres (equirectangular approximation good enough
 *  for short hops on a single map tile). */
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

function tileBounds(z: number, x: number, y: number): {
  wLng: number; eLng: number; nLat: number; sLat: number;
} {
  const n = 2 ** z;
  const wLng = (x / n) * 360 - 180;
  const eLng = ((x + 1) / n) * 360 - 180;
  const nLat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI;
  const sLat = (Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / n))) * 180) / Math.PI;
  return { wLng, eLng, nLat, sLat };
}

/**
 * Shade a 256×256 RGBA tile for the given circles at XYZ `(z, x, y)`,
 * sampling `blocks × blocks` pixel blocks (coarser blocks = cheaper tiles).
 * Returns raw RGBA bytes (not yet PNG-encoded).
 */
export function shadeTileRgba(
  circles: CircleSpec[],
  z: number,
  x: number,
  y: number,
  blocks = 8,
): Buffer {
  const { wLng, eLng, nLat, sLat } = tileBounds(z, x, y);
  const pixels = Buffer.alloc(TILE_SIZE * TILE_SIZE * 4);
  if (circles.length === 0) return pixels;
  const step = TILE_SIZE / blocks;
  for (let by = 0; by < blocks; by++) {
    for (let bx = 0; bx < blocks; bx++) {
      const lon = wLng + ((bx + 0.5) / blocks) * (eLng - wLng);
      const lat = nLat + ((by + 0.5) / blocks) * (sLat - nLat);
      // Find the tightest enclosing circle (smallest radius that contains
      // the point); ramp by distance to that circle's centre.
      let bestT = -1;
      for (const c of circles) {
        const dist = haversineM({ lng: lon, lat }, c.center);
        if (dist > c.radiusMeters) continue;
        const t = 1 - dist / c.radiusMeters;
        if (t > bestT) bestT = t;
      }
      const r = bestT >= 0 ? 255 : 0;
      const g = bestT >= 0 ? Math.round(180 * bestT + 40) : 0;
      const b = bestT >= 0 ? Math.round(40 * bestT) : 0;
      const a = bestT >= 0 ? Math.round(255 * bestT * bestT) : 0;
      const baseRow = by * step;
      const baseCol = bx * step;
      for (let dy = 0; dy < step; dy++) {
        for (let dx = 0; dx < step; dx++) {
          const idx = ((baseRow + dy) * TILE_SIZE + (baseCol + dx)) * 4;
          pixels[idx + 0] = r;
          pixels[idx + 1] = g;
          pixels[idx + 2] = b;
          pixels[idx + 3] = a;
        }
      }
    }
  }
  return pixels;
}