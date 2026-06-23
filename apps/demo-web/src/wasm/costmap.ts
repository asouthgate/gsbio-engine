/**
 * Forage Cost — WebAssembly kernel (AssemblyScript source).
 *
 * Mirrors `apps/demo-web/src/models/forageCost/diffusion.ts` line-for-line.
 * Compiled with `pnpm --filter @gsbio/demo-web build:wasm` (invokes `asc`)
 * to produce `costmap.wasm` (committed). The repo ships the binary so a
 * fresh clone can `pnpm dev` without installing the AssemblyScript
 * toolchain; the source is here for inspection and regeneration.
 *
 * Boundary contract: JS calls `setup(rows, cols)` once per run, marks every
 * source/barrier by `(r, c)` index, calls `relax(rows, cols, iters)`, then
 * reads back the `Float32Array` view through `dataStart()` + `memory`. No
 * typed-array arguments cross the boundary — only scalars and a pointer
 * back. This keeps the wasm import minimal.
 */

export const MAX_COST: f32 = 1e9;

let cost: Float32Array | null = null;

export function setup(rows: u32, cols: u32): void {
  const n = rows * cols;
  const arr = new Float32Array(n);
  for (let i: u32 = 0; i < n; i++) arr[i] = MAX_COST;
  cost = arr;
}

export function markSource(r: u32, c: u32, cols: u32): void {
  const arr = cost;
  if (!arr) return;
  arr[r * cols + c] = 0;
}

export function markBarrier(r: u32, c: u32, cols: u32): void {
  const arr = cost;
  if (!arr) return;
  arr[r * cols + c] = NaN;
}

export function relax(rows: u32, cols: u32, iters: u32): void {
  const c = cost;
  if (!c) return;
  for (let iter: u32 = 0; iter < iters; iter++) {
    for (let r: u32 = 0; r < rows; r++) {
      for (let col: u32 = 0; col < cols; col++) {
        const i = r * cols + col;
        const v = c[i];
        if (isNaN(v) || v === 0) continue;
        let m = v;
        if (r > 0) {
          const n = c[(r - 1) * cols + col];
          if (!isNaN(n) && n + 1 < m) m = n + 1;
        }
        if (r < rows - 1) {
          const n = c[(r + 1) * cols + col];
          if (!isNaN(n) && n + 1 < m) m = n + 1;
        }
        if (col > 0) {
          const n = c[r * cols + (col - 1)];
          if (!isNaN(n) && n + 1 < m) m = n + 1;
        }
        if (col < cols - 1) {
          const n = c[r * cols + (col + 1)];
          if (!isNaN(n) && n + 1 < m) m = n + 1;
        }
        c[i] = m;
      }
    }
  }
}

export function dataStart(): usize {
  const arr = cost;
  return arr ? arr.dataStart : 0;
}

export function length(): u32 {
  const arr = cost;
  return arr ? arr.length : 0;
}