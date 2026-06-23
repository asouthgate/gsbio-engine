/**
 * Forage Cost — cost → RGBA colour map.
 *
 * Pure presentation: turns a cost-distance `Float32Array` into a square RGBA
 * raster the executor can bake into an `image` envelope. Lives separately so
 * the kernel (in `diffusion.ts` / `wasm/costmap.ts`) stays presentation-
 * free. `NaN` cells (barriers) and unreachable cells (`MAX_COST`) are drawn
 * fully transparent; reachable cells run green (cheap) → yellow → red
 * (expensive).
 */

import { MAX_COST } from './diffusion';

export function costToImageData(
  cost: Float32Array,
  rows: number,
  cols: number,
): ImageData {
  let max = 0;
  for (let i = 0; i < cost.length; i++) {
    const v = cost[i];
    if (!Number.isNaN(v) && v < MAX_COST && v > max) max = v;
  }
  const out = new ImageData(cols, rows);
  for (let i = 0; i < cost.length; i++) {
    const v = cost[i];
    const j = i * 4;
    if (Number.isNaN(v) || v >= MAX_COST || max === 0) {
      out.data[j + 3] = 0;
      continue;
    }
    const t = v / max; // 0 cheap → 1 expensive
    out.data[j + 0] = Math.round(255 * t); // R ↑
    out.data[j + 1] = Math.round(255 * (1 - t) * 0.85); // G ↓
    out.data[j + 2] = Math.round(60 * (1 - t)); // small B
    out.data[j + 3] = Math.round(255 * (0.45 + 0.55 * (1 - t))); // alpha
  }
  return out;
}