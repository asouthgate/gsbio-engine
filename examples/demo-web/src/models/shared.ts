/**
 * Shared helpers for the two radial-spread demo archetypes (WASM compute and
 * mock-API compute). Both consume the same drawn `Spread_zone` circle category
 * and pin one image/tile raster per circle to the same equirectangular bounds,
 * so the only visible difference between the archetypes is the compute path.
 */

import type { DataFeature } from '@gsbio/engine';

export interface Zone {
  id: string;
  center: { lng: number; lat: number };
  radiusMeters: number;
}

/** Filter drawn features down to `Spread_zone` circles. */
export function selectSpreadZones(features: ReadonlyArray<DataFeature>): Zone[] {
  const out: Zone[] = [];
  for (const f of features) {
    if (f.category === 'Spread_zone' && f.geometryKind === 'circle' && f.circle) {
      out.push({
        id: f.id,
        center: f.circle.center,
        radiusMeters: f.circle.radiusMeters,
      });
    }
  }
  return out;
}

/** Equirectangular bbox `[w, s, e, n]` (lng/lat) for a circle's inscribed
 *  square — the bounds the renderer uses to georeference an `image` envelope. */
export function circleBounds(z: Zone): [number, number, number, number] {
  const dLat = z.radiusMeters / 111_320;
  const dLng = z.radiusMeters / (111_320 * Math.cos((z.center.lat * Math.PI) / 180));
  return [
    z.center.lng - dLng,
    z.center.lat - dLat,
    z.center.lng + dLng,
    z.center.lat + dLat,
  ];
}
