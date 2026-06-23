/**
 * Forage Cost — raw diffusion kernel (TypeScript reference).
 *
 * Computes a cost-distance raster: each non-barrier cell accumulates the
 * cheapest 4-neighbour path cost from any `Source` cell. Source cells are
 * held at 0; barrier cells are impassable (`NaN`); everything else relaxes
 * toward `MAX_COST` over `iters` iterations of a min-plus sweep.
 *
 * The same algorithm is compiled to WebAssembly in `apps/demo-web/src/wasm/
 * costmap.ts`. This TS version exists so the math is human-readable without
 * an AssemblyScript toolchain — and so the WASM executor's results can be
 * sanity-checked against a pure-JS run.
 */

export const MAX_COST = 1e9;

export interface CostGrid {
  rows: number;
  cols: number;
  /** Row-major `Float32Array` of length `rows*cols`. NaN ⇒ barrier cell. */
  cost: Float32Array;
}

/** Mark `idx` as a source (cost 0). Resets everything else to `MAX_COST`. */
export function initCostGrid(rows: number, cols: number): CostGrid {
  const n = rows * cols;
  const cost = new Float32Array(n);
  cost.fill(MAX_COST);
  return { rows, cols, cost };
}

/** Stamp a single source cell to 0. */
export function markSource(g: CostGrid, r: number, c: number): void {
  g.cost[r * g.cols + c] = 0;
}

/** Stamp a single barrier cell to NaN (impassable). */
export function markBarrier(g: CostGrid, r: number, c: number): void {
  g.cost[r * g.cols + c] = NaN;
}

/** Run `iters` rounds of min-plus relaxation. Modifies `g.cost` in place. */
export function relax(g: CostGrid, iters: number): void {
  const { rows, cols, cost } = g;
  for (let iter = 0; iter < iters; iter++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const v = cost[i];
        if (Number.isNaN(v) || v === 0) continue;
        let m = v;
        if (r > 0) {
          const n = cost[(r - 1) * cols + c];
          if (!Number.isNaN(n) && n + 1 < m) m = n + 1;
        }
        if (r < rows - 1) {
          const n = cost[(r + 1) * cols + c];
          if (!Number.isNaN(n) && n + 1 < m) m = n + 1;
        }
        if (c > 0) {
          const n = cost[r * cols + (c - 1)];
          if (!Number.isNaN(n) && n + 1 < m) m = n + 1;
        }
        if (c < cols - 1) {
          const n = cost[r * cols + (c + 1)];
          if (!Number.isNaN(n) && n + 1 < m) m = n + 1;
        }
        cost[i] = m;
      }
    }
  }
}