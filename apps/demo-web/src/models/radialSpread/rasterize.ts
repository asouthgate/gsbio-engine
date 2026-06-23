/**
 * Radial Spread — raw rasterisation glue (WASM → image envelope).
 *
 * The AssemblyScript kernel in `apps/demo-web/src/wasm/spread.ts` fills the
 * `N × N` RGBA distance-shaded ramp; this module just shepherds the wasm
 * bytes back into an `ImageData`, bakes it onto a throwaway canvas, and
 * returns the PNG data URL the executor wraps in one (reused) `image`
 * envelope per circle. No engine imports here — the executor glue in
 * `./executor.ts` calls this and attaches the geo `bounds`.
 *
 * The kernel's fill is identical for every circle (a centred distance field),
 * so `renderRadialRaster` is called once per run and the resulting data URL
 * is shared by every circle's envelope.
 */

import {
  setup as wasmSetup,
  fillRadial as wasmFillRadial,
  dataStart as wasmDataStart,
  memory as wasmMemory,
} from '../../wasm/spread.wasm';

/** Fill the radial ramp via the wasm kernel and return the PNG data URL. */
export function renderRadialRaster(n: number): string {
  wasmSetup(n);
  wasmFillRadial(n);
  const nbytes = n * n * 4;
  const bytes = new Uint8Array(wasmMemory.buffer, wasmDataStart(), nbytes);
  const clamped = new Uint8ClampedArray(bytes);
  const imageData = new ImageData(clamped, n, n);
  const canvas = document.createElement('canvas');
  canvas.width = n;
  canvas.height = n;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  ctx.putImageData(imageData, 0, 0);
  return canvas.toDataURL('image/png');
}