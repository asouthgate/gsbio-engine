/**
 * Radial Spread — raw simulation kernel.
 *
 * Pure main-thread rasterisation. No engine imports; the executor glue in
 * `./model.ts` calls these to produce one `image` envelope per drawn circle.
 *
 * The "biology" is a warm colour ramp fading from the centre: it stands in
 * for the expected density of a population diffusing outward from a release
 * point. Purely illustrative.
 */

import type { MapLayerEnvelope, ResultLayerEntry } from '@gsbio/core';

export interface SourceZone {
  id: string;
  center: { lng: number; lat: number };
  radiusMeters: number;
}

/** Pixel-fill a distance-shaded RGBA raster for one zone onto a square canvas
 *  of size `N × N`, returning the envelope that pins it to the globe. */
export function rasterForZone(
  ctx: CanvasRenderingContext2D,
  z: SourceZone,
  N: number,
): MapLayerEnvelope {
  const img = ctx.createImageData(N, N);
  const cx = (N - 1) / 2;
  const cy = (N - 1) / 2;
  const rNorm = N / 2;
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      // Normalised distance from centre: 0 (centre) → 1 (zone edge).
      const d = Math.hypot(x - cx, y - cy) / rNorm;
      const i = (y * N + x) * 4;
      if (d >= 1) {
        img.data[i + 0] = 0;
        img.data[i + 1] = 0;
        img.data[i + 2] = 0;
        img.data[i + 3] = 0;
      } else {
        const t = 1 - d;
        img.data[i + 0] = 255;
        img.data[i + 1] = Math.round(180 * t + 40);
        img.data[i + 2] = Math.round(40 * t);
        img.data[i + 3] = Math.round(255 * t * t);
      }
    }
  }
  ctx.putImageData(img, 0, 0);
  const url = (ctx.canvas as HTMLCanvasElement).toDataURL('image/png');
  const dLat = z.radiusMeters / 111_320;
  const dLng = z.radiusMeters / (111_320 * Math.cos((z.center.lat * Math.PI) / 180));
  const bounds: [number, number, number, number] = [
    z.center.lng - dLng,
    z.center.lat - dLat,
    z.center.lng + dLng,
    z.center.lat + dLat,
  ];
  return { kind: 'image', url, bounds };
}

/** Rasterise every zone into its own envelope. Each `ResultLayerEntry.id` is
 *  the source feature's id so the per-layer toggle in <ResultsPanel> stays
 *  stable across re-runs. */
export function rasterizeZones(
  zones: SourceZone[],
  resolution: number,
): { layers: ResultLayerEntry[]; summary: { count: number; zoneIds: string[] } } {
  const layers: ResultLayerEntry[] = [];
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { layers, summary: { count: 0, zoneIds: [] } };
  for (const z of zones) {
    layers.push({ id: z.id, envelope: rasterForZone(ctx, z, resolution) });
  }
  return {
    layers,
    summary: { count: layers.length, zoneIds: zones.map((z) => z.id) },
  };
}