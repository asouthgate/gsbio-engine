/**
 * Radial Spread rasterisation wrapper
 */

import {
  setup as wasmSetup,
  fillRadial as wasmFillRadial,
  dataStart as wasmDataStart,
  memory as wasmMemory,
} from '../../wasm/spread.wasm';

/** Fill the radial ramp via the wasm kernel and return the PNG data URL.
 *  The canvas acts as a built-in PNG encoder for the raw RGBA pixel buffer. */
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
