/**
 * Corridor Connect — raw simulation kernel.
 *
 * Given a set of `Patch` points (lng/lat), builds a nearest-neighbour graph
 * of corridors between them: each patch connects to its single nearest
 * neighbour (a low-degree "minimum hopping" graph — a stand-in for movement
 * corridors between habitat patches). The output is a GeoJSON
 * FeatureCollection of LineString features representing corridors.
 *
 * Used by the mocked API server (`apps/demo-web/src/mock/fakeApi.ts`) so
 * the executor's `submit` glue in `./model.ts` just POSTs features + polls
 * for the result. The raw math is here so you can read it without the
 * network transport noise.
 */

export interface PatchPoint {
  lng: number;
  lat: number;
  id: string;
}

export type CorridorFeature = GeoJSON.Feature<
  GeoJSON.LineString,
  { from: string; to: string; distanceKm: number }
>;

/** Great-circle distance in km (equirectangular approximation, good enough
 *  for short hops on a single map). */
export function haversineKm(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const x = dLng * Math.cos((lat1 + lat2) / 2);
  const y = dLat;
  return Math.sqrt(x * x + y * y) * R;
}

/** Nearest-neighbour graph: each patch adds a single corridor to its closest
 *  distinct neighbour. Returns one LineString per link (de-duplicated; A→B and
 *  B→A collapse to a single link because each is the other's closest in
 *  reciprocal cases, or stays as a distinct corridor otherwise). */
export function buildCorridors(patches: PatchPoint[]): CorridorFeature[] {
  if (patches.length < 2) return [];
  const corridors: CorridorFeature[] = [];
  const seen = new Set<string>();
  for (const from of patches) {
    let nearest: PatchPoint | null = null;
    let bestKm = Infinity;
    for (const to of patches) {
      if (to.id === from.id) continue;
      const km = haversineKm(from, to);
      if (km < bestKm) {
        bestKm = km;
        nearest = to;
      }
    }
    if (!nearest) continue;
    const key = from.id < nearest.id ? `${from.id}|${nearest.id}` : `${nearest.id}|${from.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    corridors.push({
      type: 'Feature',
      geometry: {
        type: 'LineString',
        coordinates: [
          [from.lng, from.lat],
          [nearest.lng, nearest.lat],
        ],
      },
      properties: {
        from: from.id,
        to: nearest.id,
        distanceKm: parseFloat(bestKm.toFixed(2)),
      },
    });
  }
  return corridors;
}

/** Point-to-segment distance (lng/lat units, great-circle ignored — small
 *  rasters at low zoom so equirectangular error is negligible). */
export function pointSegDist(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    const ddx = px - ax;
    const ddy = py - ay;
    return Math.sqrt(ddx * ddx + ddy * ddy);
  }
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  const cx = ax + t * dx;
  const cy = ay + t * dy;
  const ddx = px - cx;
  const ddy = py - cy;
  return Math.sqrt(ddx * ddx + ddy * ddy);
}