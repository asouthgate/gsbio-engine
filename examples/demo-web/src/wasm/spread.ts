/**
 * Radial Spread — WebAssembly kernel (AssemblyScript source).
 *
 * Fills an `N × N` RGBA raster with the distance-shaded warm ramp shared by
 * both demo archetypes: each pixel inside the centred disc is shaded by its
 * normalised distance `d = dist / (N/2)` from the centre —
 *
 *   R = 255, G = 180·(1-d)+40, B = 40·(1-d), A = 255·(1-d)²
 *
 * Pixels outside the disc (d ≥ 1) are fully transparent. The raster is the
 * same for every circle (a centred distance field); the executor reuses one
 * rendered image per circle and only the geo `bounds` differ per circle.
 *
 * Compiled with `pnpm --filter @gsbio/demo-web build:wasm` (invokes `asc`)
 * to produce `spread.wasm` (committed). The repo ships the binary so a fresh
 * clone can `pnpm dev` without installing the AssemblyScript toolchain; the
 * source is here for inspection and regeneration.
 *
 * Boundary contract: JS calls `setup(N)` once per run, then `fillRadial(N)`,
 * then reads the `Uint8Array` view back through `dataStart()` + `memory`. No
 * typed-array arguments cross the boundary — only scalars and a pointer
 * back. This keeps the wasm import minimal.
 */

let pixels: Uint8Array | null = null;

export function setup(n: u32): void {
  const size = n * n * 4;
  pixels = new Uint8Array(size);
}

export function fillRadial(n: u32): void {
  const p = pixels;
  if (!p) return;
  const half: f32 = n as f32 * 0.5;
  const cx: f32 = (n as f32 - 1) * 0.5;
  const rNormSq = half * half;
  for (let y: u32 = 0; y < n; y++) {
    for (let x: u32 = 0; x < n; x++) {
      const dx: f32 = x as f32 - cx;
      const dy: f32 = y as f32 - cx;
      const dSq: f32 = dx * dx + dy * dy;
      const idx: u32 = (y * n + x) * 4;
      if (dSq >= rNormSq) {
        p[idx + 0] = 0;
        p[idx + 1] = 0;
        p[idx + 2] = 0;
        p[idx + 3] = 0;
      } else {
        const d = Math.sqrt(dSq) / half;
        const t = 1 - d;
        p[idx + 0] = 255;
        p[idx + 1] = (180 * t + 40) as u8;
        p[idx + 2] = (40 * t) as u8;
        p[idx + 3] = (255 * t * t) as u8;
      }
    }
  }
}

export function dataStart(): usize {
  const p = pixels;
  return p ? p.dataStart : 0;
}

export function length(): u32 {
  const p = pixels;
  return p ? p.length : 0;
}