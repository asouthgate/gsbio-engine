// Shared raster plotting: turn a value grid into a georeferenced PNG with a
// baked colorbar. Used by roost finding, browser resistance, and server rasters
// (coverage / resistance / current) so every heatmap looks and downloads the
// same way.

import { paletteLUT, type PaletteId } from './palettes';

export type RasterScale = 'linear' | 'log';

/** How the stored values were produced (used for colorbar labels). */
export type RasterTransform = 'none' | 'log1p' | 'log10';

/** A value grid, row-major with row 0 at the north edge. */
export interface RasterGrid {
  data: Float32Array;
  width: number;
  height: number;
  /** [west, south, east, north] in EPSG:4326. */
  boundsWgs84: [number, number, number, number];
  nodata?: number;
}

/** Display metadata that travels alongside a layer. */
export interface DisplayMeta {
  palette: PaletteId | number[][];
  /** Colour normalisation of the stored values. */
  scale?: RasterScale;
  /** Transform applied to the underlying quantity before storage. */
  transform?: RasterTransform;
  /** True when the file itself is already transformed (e.g. server log_* rasters). */
  preTransformed?: boolean;
  vmin?: number;
  vmax?: number;
  /** Flip the palette direction (e.g. roost loss: 0 = warm). */
  invert?: boolean;
  label?: string;
  unit?: string;
  /** Clip display to the inscribed circle (current maps). */
  circularMask?: boolean;
}

export interface RasterAnnotation {
  lng: number;
  lat: number;
  radius: number;
  color: string;
  strokeColor?: string;
  strokeWidth?: number;
}

export interface ColorbarSpec {
  side?: 'right' | 'bottom';
  /** Bar thickness in pixels. */
  width?: number;
}

export interface RasterPlotSpec extends DisplayMeta {
  /** Baked colorbar; pass `false` to disable, omit for a default right bar. */
  colorbar?: ColorbarSpec | false;
  /**
   * Contour levels as fractions of the normalised value range. Levels are
   * drawn with a gradient-scaled width so they stay thin in steep areas and
   * disappear in flat areas (matching the original roost renderer).
   */
  contours?: { levels: number[]; color?: string; width?: number };
  annotations?: RasterAnnotation[];
}

export interface RasterPlotResult {
  url: string;
  boundsWgs84: [number, number, number, number];
  min: number;
  max: number;
}

/** Pixel margins around the data region. */
export interface PlotMargins {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** Minimum data-region resolution (upscaled if smaller) so bars/labels are smooth. */
const MIN_RENDER = 1000;

// ---------------------------------------------------------------------------
// Pure helpers (unit-tested; no DOM)
// ---------------------------------------------------------------------------

export function computeDomain(
  data: Float32Array,
  opts: { vmin?: number; vmax?: number; scale?: RasterScale; nodata?: number } = {},
): [number, number] {
  const scale = opts.scale ?? 'linear';
  if (opts.vmin !== undefined && opts.vmax !== undefined && opts.vmax > opts.vmin) {
    return [opts.vmin, opts.vmax];
  }
  let min = Infinity;
  let max = -Infinity;
  for (let i = 0; i < data.length; i++) {
    const v = data[i];
    if (!Number.isFinite(v)) continue;
    if (opts.nodata !== undefined && v === opts.nodata) continue;
    if (scale === 'log' && v <= 0) continue;
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (opts.vmin !== undefined) min = opts.vmin;
  if (opts.vmax !== undefined) max = opts.vmax;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return [Number.isFinite(min) ? min : 0, Number.isFinite(max) ? max : 1];
  }
  return [min, max];
}

/** Normalise a stored value into `[0, 1]` for the palette. */
export function normalizeValue(v: number, min: number, max: number, scale: RasterScale = 'linear'): number {
  if (scale === 'log') {
    const lo = Math.log(Math.max(min, Number.MIN_VALUE));
    const hi = Math.log(Math.max(max, Number.MIN_VALUE));
    if (hi <= lo) return 0;
    const t = (Math.log(Math.max(v, min)) - lo) / (hi - lo);
    return t < 0 ? 0 : t > 1 ? 1 : t;
  }
  const range = max - min;
  if (range <= 0) return 0;
  const t = (v - min) / range;
  return t < 0 ? 0 : t > 1 ? 1 : t;
}

/** Human-facing value for a colorbar tick (inverts pre-applied transforms). */
export function invertTransform(v: number, transform: RasterTransform = 'none'): number {
  switch (transform) {
    case 'log1p':
      return Math.expm1(v);
    case 'log10':
      return Math.pow(10, v);
    default:
      return v;
  }
}

export function computeTicks(min: number, max: number, scale: RasterScale = 'linear', count = 5): number[] {
  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min || count < 2) return [min, max];
  if (scale === 'log' && min > 0) {
    const ticks: number[] = [];
    const lo = Math.floor(Math.log10(min));
    const hi = Math.ceil(Math.log10(max));
    for (let e = lo; e <= hi; e++) {
      const v = Math.pow(10, e);
      if (v >= min * 0.999 && v <= max * 1.001) ticks.push(v);
    }
    if (ticks.length >= 2) return ticks;
  }
  const ticks: number[] = [];
  for (let i = 0; i < count; i++) ticks.push(min + ((max - min) * i) / (count - 1));
  return ticks;
}

export function formatTick(v: number): string {
  if (!Number.isFinite(v)) return '';
  const a = Math.abs(v);
  if (a === 0) return '0';
  if (a >= 1e5 || a < 1e-3) return v.toExponential(1);
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return String(Number(v.toFixed(2)));
}

/**
 * Expand WGS84 bounds so that, once the output image is padded by `margins`
 * (in output pixels), the original data region still maps to the input bounds.
 * Works for margins on any side.
 */
export function expandBoundsForMargins(
  bounds: [number, number, number, number],
  renderW: number,
  renderH: number,
  margins: PlotMargins,
): [number, number, number, number] {
  const [w, s, e, n] = bounds;
  const dx = renderW > 1 ? (e - w) / (renderW - 1) : 0;
  const dy = renderH > 1 ? (n - s) / (renderH - 1) : 0;
  return [
    w - margins.left * dx,
    s - margins.bottom * dy,
    e + margins.right * dx,
    n + margins.top * dy,
  ];
}

export function projectToPixel(
  lng: number,
  lat: number,
  bounds: [number, number, number, number],
  width: number,
  height: number,
): [number, number] {
  const [w, s, e, n] = bounds;
  const px = e === w ? 0 : ((lng - w) / (e - w)) * (width - 1);
  const py = n === s ? 0 : ((n - lat) / (n - s)) * (height - 1);
  return [px, py];
}

// ---------------------------------------------------------------------------
// Plotting (browser canvas)
// ---------------------------------------------------------------------------

/**
 * Render a value grid to a PNG blob URL, optionally baking a colorbar into a
 * padded margin. The data region is upscaled to at least `MIN_RENDER` pixels so
 * the bar and labels stay crisp. The returned `boundsWgs84` are the (possibly
 * expanded) bounds so the data region stays georeferenced.
 */
export async function plotRaster(grid: RasterGrid, spec: RasterPlotSpec): Promise<RasterPlotResult> {
  const { data, width: dw, height: dh, boundsWgs84, nodata } = grid;
  if (data.length !== dw * dh) {
    throw new Error(`plotRaster: data length ${data.length} != ${dw}x${dh}`);
  }
  const scale = spec.scale ?? 'linear';
  const [min, max] = computeDomain(data, { vmin: spec.vmin, vmax: spec.vmax, scale, nodata });
  const lut = paletteLUT(spec.palette, 256);

  const renderW = Math.max(dw, MIN_RENDER);
  const renderH = Math.max(dh, MIN_RENDER);
  const renderMax = Math.max(renderW, renderH);
  // Scale the colorbar furniture with the output resolution so it stays
  // legible relative to the image rather than looking miniature.
  const metric = (frac: number, lo: number, hi: number) =>
    Math.round(Math.min(hi, Math.max(lo, renderMax * frac)));

  const bar = spec.colorbar === false ? null : { ...(spec.colorbar ?? {}) };
  const margins: PlotMargins = { left: 0, right: 0, top: 0, bottom: 0 };
  const barSide: 'right' | 'bottom' = bar?.side ?? 'right';
  const barWidth = bar ? (bar.width ?? metric(0.04, 20, 90)) : 0;
  const barGap = metric(0.01, 6, 26);
  const barPad = metric(0.024, 14, 52);
  const labelSpace = metric(0.15, 90, 300);
  const fontSize = metric(0.034, 20, 72);
  if (bar) {
    if (barSide === 'right') {
      margins.right = barWidth + barGap + labelSpace;
      margins.top = barPad;
      margins.bottom = barPad;
    } else {
      margins.bottom = barWidth + barGap + Math.round(fontSize * 1.6);
      margins.left = barPad;
      margins.right = barPad;
    }
  }

  const outW = margins.left + renderW + margins.right;
  const outH = margins.top + renderH + margins.bottom;

  // Normalised values (NaN = transparent).
  const norm = new Float32Array(dw * dh);
  const range = max - min || 1;
  const logLo = scale === 'log' ? Math.log(Math.max(min, Number.MIN_VALUE)) : 0;
  const logRange = scale === 'log' ? Math.log(Math.max(max, Number.MIN_VALUE)) - logLo || 1 : 1;
  const cx = dw / 2;
  const cy = dh / 2;
  const cr = Math.min(dw, dh) / 2;
  for (let row = 0; row < dh; row++) {
    for (let col = 0; col < dw; col++) {
      const i = row * dw + col;
      const v = data[i];
      let t = NaN;
      if (Number.isFinite(v) && !(nodata !== undefined && v === nodata)) {
        if (spec.circularMask) {
          const ddx = col + 0.5 - cx;
          const ddy = row + 0.5 - cy;
          if (ddx * ddx + ddy * ddy > cr * cr) {
            norm[i] = NaN;
            continue;
          }
        }
        t = scale === 'log'
          ? (Math.log(Math.max(v, min)) - logLo) / logRange
          : (v - min) / range;
        t = t < 0 ? 0 : t > 1 ? 1 : t;
      }
      norm[i] = t;
    }
  }

  const levels = spec.contours?.levels ?? [];
  const contourWidth = spec.contours?.width ?? 0.75;
  const white = spec.contours?.color?.startsWith('#')
    ? hexToRgb(spec.contours.color)
    : [255, 255, 255];
  const grad = levels.length > 0 ? gradient(norm, dw, dh) : null;
  // Convert gradient to value-per-*output*-pixel so contour bands have a
  // constant on-screen thickness after upscaling.
  const gxStep = dw > 1 ? (dw - 1) / (renderW - 1) : 1;
  const gyStep = dh > 1 ? (dh - 1) / (renderH - 1) : 1;

  const src = document.createElement('canvas');
  src.width = dw;
  src.height = dh;
  const srcCtx = src.getContext('2d');
  if (!srcCtx) throw new Error('plotRaster: 2D canvas unavailable');
  const img = srcCtx.createImageData(dw, dh);
  for (let i = 0; i < norm.length; i++) {
    const t = norm[i];
    if (Number.isNaN(t)) continue;
    let isContour = false;
    if (grad && levels.length > 0) {
      const mag = Math.hypot(grad[0][i] * gxStep, grad[1][i] * gyStep);
      if (mag > 1e-12) {
        for (const level of levels) {
          if (Math.abs(t - level) / mag < contourWidth) { isContour = true; break; }
        }
      }
    }
    const [r, g, b] = isContour ? white : sampleLut(lut, spec.invert ? 1 - t : t);
    const px = i * 4;
    img.data[px] = r;
    img.data[px + 1] = g;
    img.data[px + 2] = b;
    img.data[px + 3] = 255;
  }
  srcCtx.putImageData(img, 0, 0);

  const canvas = document.createElement('canvas');
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('plotRaster: 2D canvas unavailable');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(src, margins.left, margins.top, renderW, renderH);

  if (spec.annotations?.length) {
    const annScale = Math.max(renderW / dw, renderH / dh);
    for (const a of spec.annotations) {
      const [px, py] = projectToPixel(a.lng, a.lat, boundsWgs84, renderW, renderH);
      const x = margins.left + px;
      const y = margins.top + py;
      ctx.beginPath();
      ctx.arc(x, y, a.radius * annScale, 0, Math.PI * 2);
      ctx.fillStyle = a.color;
      ctx.fill();
      if (a.strokeColor && a.strokeWidth) {
        ctx.lineWidth = a.strokeWidth * annScale;
        ctx.strokeStyle = a.strokeColor;
        ctx.stroke();
      }
    }
  }

  if (bar) {
    drawColorbar(ctx, lut, min, max, spec, {
      side: barSide,
      barWidth,
      barGap,
      fontSize,
      renderW,
      renderH,
      margins,
    });
  }

  const url = await canvasToBlobUrl(canvas);
  const boundsOut = bar ? expandBoundsForMargins(boundsWgs84, renderW, renderH, margins) : boundsWgs84;
  return { url, boundsWgs84: boundsOut, min, max };
}

/** Central-difference gradient of the normalised grid (value per index step). */
function gradient(norm: Float32Array, w: number, h: number): [Float32Array, Float32Array] {
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const cl = col === 0 ? 0 : col - 1;
      const cr = col === w - 1 ? w - 1 : col + 1;
      const rt = row === 0 ? 0 : row - 1;
      const rb = row === h - 1 ? h - 1 : row + 1;
      gx[row * w + col] = (norm[row * w + cr] - norm[row * w + cl]) / ((cr - cl) || 1);
      gy[row * w + col] = (norm[rb * w + col] - norm[rt * w + col]) / ((rb - rt) || 1);
    }
  }
  return [gx, gy];
}

function sampleLut(lut: Uint8Array, t: number): [number, number, number] {
  const idx = Math.max(0, Math.min(255, Math.round(t * 255)));
  return [lut[idx * 3], lut[idx * 3 + 1], lut[idx * 3 + 2]];
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function canvasToBlobUrl(canvas: HTMLCanvasElement): Promise<string> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(URL.createObjectURL(blob));
      else reject(new Error('plotRaster: failed to encode PNG'));
    }, 'image/png');
  });
}

interface ColorbarDrawOpts {
  side: 'right' | 'bottom';
  barWidth: number;
  barGap: number;
  fontSize: number;
  renderW: number;
  renderH: number;
  margins: PlotMargins;
}

function drawColorbar(
  ctx: CanvasRenderingContext2D,
  lut: Uint8Array,
  min: number,
  max: number,
  spec: Pick<DisplayMeta, 'scale' | 'invert' | 'transform' | 'preTransformed'>,
  opts: ColorbarDrawOpts,
): void {
  const scale = spec.scale ?? 'linear';
  const tickLen = Math.max(3, Math.round(opts.fontSize * 0.45));
  const labelGap = Math.max(3, Math.round(opts.fontSize * 0.3));
  const lineWidth = Math.max(1, Math.round(opts.fontSize * 0.08));
  ctx.save();
  ctx.lineWidth = lineWidth;
  ctx.strokeStyle = 'rgba(255,255,255,0.65)';
  ctx.fillStyle = '#ffffff';
  ctx.font = `${opts.fontSize}px sans-serif`;

  if (opts.side === 'right') {
    const x = opts.margins.left + opts.renderW + opts.barGap;
    const y = opts.margins.top;
    const h = opts.renderH;
    for (let py = 0; py < h; py++) {
      const t = 1 - py / (h - 1 || 1);
      const [r, g, b] = sampleLut(lut, spec.invert ? 1 - t : t);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x, y + py, opts.barWidth, 1);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, opts.barWidth - lineWidth, h - lineWidth);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (const v of computeTicks(min, max, scale, 5)) {
      const py = y + (1 - normalizeValue(v, min, max, scale)) * (h - 1);
      ctx.beginPath();
      ctx.moveTo(x + opts.barWidth, py);
      ctx.lineTo(x + opts.barWidth + tickLen, py);
      ctx.stroke();
      const label = spec.preTransformed ? invertTransform(v, spec.transform) : v;
      ctx.fillText(formatTick(label), x + opts.barWidth + tickLen + labelGap, py);
    }
  } else {
    const y = opts.margins.top + opts.renderH + opts.barGap;
    const x = opts.margins.left;
    const w = opts.renderW;
    for (let px = 0; px < w; px++) {
      const t = px / (w - 1 || 1);
      const [r, g, b] = sampleLut(lut, spec.invert ? 1 - t : t);
      ctx.fillStyle = `rgb(${r},${g},${b})`;
      ctx.fillRect(x + px, y, 1, opts.barWidth);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.strokeRect(x + lineWidth / 2, y + lineWidth / 2, w - lineWidth, opts.barWidth - lineWidth);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (const v of computeTicks(min, max, scale, 5)) {
      const px = x + normalizeValue(v, min, max, scale) * (w - 1);
      ctx.beginPath();
      ctx.moveTo(px, y + opts.barWidth);
      ctx.lineTo(px, y + opts.barWidth + tickLen);
      ctx.stroke();
      const label = spec.preTransformed ? invertTransform(v, spec.transform) : v;
      ctx.fillText(formatTick(label), px, y + opts.barWidth + tickLen + labelGap);
    }
  }
  ctx.restore();
}
