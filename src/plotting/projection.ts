// Projection helpers for the shared raster plotter.

import proj4 from 'proj4';

const WGS84 = 'EPSG:4326';
const BNG =
  '+proj=tmerc +lat_0=49 +lon_0=-2 +k=0.9996012717 +x_0=400000 +y_0=-100000 +ellps=airy +towgs84=446.448,-125.157,542.06,0.1502,0.247,0.8421,-20.4894 +units=m +no_defs';

export type RasterCrs = 'EPSG:4326' | 'EPSG:27700';

export type Wgs84Corner = [number, number];
export type Wgs84Corners = [Wgs84Corner, Wgs84Corner, Wgs84Corner, Wgs84Corner];

/** WGS84 (lat, lon) -> BNG [easting, northing]. */
export function wgs84ToBng(lat: number, lon: number): [number, number] {
  const [easting, northing] = proj4(WGS84, BNG, [lon, lat]);
  return [easting, northing];
}

/** BNG [easting, northing] -> WGS84 [lng, lat]. */
export function bngToWgs84LngLat(easting: number, northing: number): [number, number] {
  const [lng, lat] = proj4(BNG, WGS84, [easting, northing]);
  return [lng, lat];
}

/**
 * Project a north-up BNG extent `[xmin, ymin, xmax, ymax]` to WGS84 corners in
 * clockwise order: top-left, top-right, bottom-right, bottom-left.
 *
 * A BNG-aligned rectangle is a rotated parallelogram in WGS84, so this is *not*
 * an axis-aligned box — projecting all four corners preserves that rotation.
 */
export function bngExtentToWgs84Corners(
  [xmin, ymin, xmax, ymax]: [number, number, number, number],
): Wgs84Corners {
  return [
    bngToWgs84LngLat(xmin, ymax), // top-left
    bngToWgs84LngLat(xmax, ymax), // top-right
    bngToWgs84LngLat(xmax, ymin), // bottom-right
    bngToWgs84LngLat(xmin, ymin), // bottom-left
  ];
}

/** A value grid in its native CRS, row-major with row 0 at the north edge. */
export interface NativeRasterGrid {
  data: Float32Array;
  width: number;
  height: number;
  /** Native CRS of `bounds`. */
  crs: RasterCrs;
  /** [xmin, ymin, xmax, ymax] in `crs`. */
  bounds: [number, number, number, number];
  nodata?: number;
}

/** A value grid reprojected onto an axis-aligned WGS84 grid. */
export interface Wgs84RasterGrid {
  data: Float32Array;
  width: number;
  height: number;
  boundsWgs84: [number, number, number, number];
}

/** metres per degree of latitude at the equator. */
const METRES_PER_DEG = 111_320;

/**
 * Reproject a native-CRS grid onto an axis-aligned WGS84 grid.
 *
 * The BNG->WGS84 mapping is smooth and nearly affine over the small study areas
 * this engine handles, so the inverse transform is evaluated exactly on a coarse
 * `coarse x coarse` grid and bilinearly interpolated per output pixel. This
 * captures the grid rotation (the source of the "one corner only" misalignment)
 * without paying a proj4 call per pixel.
 *
 * @param coarse Inverse-transform interpolation grid resolution (accuracy vs
 *   cost); clamped to at least 2. Defaults to 33.
 * @param maxDim Safety cap on the output dimensions (a crash guard for absurd
 *   inputs), applied proportionally so the aspect ratio is preserved. Defaults
 *   to 4096.
 *
 * Pixels outside the source footprint (the rotated parallelogram) and any
 * `nodata`/NaN samples are left as NaN (transparent).
 */
export function reprojectGridToWgs84(
  grid: NativeRasterGrid,
  coarse = 33,
  maxDim = 4096,
): Wgs84RasterGrid {
  const { data, width: srcW, height: srcH, crs, bounds, nodata } = grid;
  const [xmin, ymin, xmax, ymax] = bounds;

  if (crs !== 'EPSG:27700') {
    return { data, width: srcW, height: srcH, boundsWgs84: [xmin, ymin, xmax, ymax] };
  }

  const corners = bngExtentToWgs84Corners([xmin, ymin, xmax, ymax]);
  const lngs = corners.map((c) => c[0]);
  const lats = corners.map((c) => c[1]);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);

  // Match the source pixel size (metres) expressed as degrees at the centre.
  const pixw = srcW > 0 ? (xmax - xmin) / srcW : 0;
  const pixh = srcH > 0 ? (ymax - ymin) / srcH : 0;
  const centreLat = (minLat + maxLat) / 2;
  const cosLat = Math.max(0.1, Math.abs(Math.cos((centreLat * Math.PI) / 180)));
  const degPerPxX = pixw / (METRES_PER_DEG * cosLat);
  const degPerPxY = pixh / METRES_PER_DEG;

  let outW = Math.max(1, Math.ceil((maxLng - minLng) / degPerPxX));
  let outH = Math.max(1, Math.ceil((maxLat - minLat) / degPerPxY));
  if (maxDim > 0) {
    const largest = Math.max(outW, outH);
    if (largest > maxDim) {
      const s = maxDim / largest;
      outW = Math.max(1, Math.round(outW * s));
      outH = Math.max(1, Math.round(outH * s));
    }
  }

  const coarseN = Math.max(2, Math.floor(coarse));

  // Coarse inverse-transform grid: (lng, lat) -> (source col, row).
  const srcCol = new Float32Array(coarseN * coarseN);
  const srcRow = new Float32Array(coarseN * coarseN);
  for (let j = 0; j < coarseN; j++) {
    const lat = maxLat - (j / (coarseN - 1)) * (maxLat - minLat);
    for (let i = 0; i < coarseN; i++) {
      const lng = minLng + (i / (coarseN - 1)) * (maxLng - minLng);
      const [easting, northing] = wgs84ToBng(lat, lng);
      srcCol[j * coarseN + i] = (easting - xmin) / pixw;
      srcRow[j * coarseN + i] = (ymax - northing) / pixh;
    }
  }

  const out = new Float32Array(outW * outH);
  const dx = maxLng === minLng ? 1 : (maxLng - minLng) / (outW || 1);
  const dy = maxLat === minLat ? 1 : (maxLat - minLat) / (outH || 1);

  for (let row = 0; row < outH; row++) {
    const lat = maxLat - (row + 0.5) * dy;
    const gy = ((maxLat - lat) / (maxLat - minLat || 1)) * (coarseN - 1);
    const yi = interpAxis(gy, coarseN);
    for (let col = 0; col < outW; col++) {
      const lng = minLng + (col + 0.5) * dx;
      const gx = ((lng - minLng) / (maxLng - minLng || 1)) * (coarseN - 1);
      const xi = interpAxis(gx, coarseN);

      const w00 = (1 - xi.f) * (1 - yi.f);
      const w10 = xi.f * (1 - yi.f);
      const w01 = (1 - xi.f) * yi.f;
      const w11 = xi.f * yi.f;

      const sc =
        w00 * srcCol[yi.i * coarseN + xi.i] +
        w10 * srcCol[yi.i * coarseN + xi.j] +
        w01 * srcCol[yi.j * coarseN + xi.i] +
        w11 * srcCol[yi.j * coarseN + xi.j];
      const sr =
        w00 * srcRow[yi.i * coarseN + xi.i] +
        w10 * srcRow[yi.i * coarseN + xi.j] +
        w01 * srcRow[yi.j * coarseN + xi.i] +
        w11 * srcRow[yi.j * coarseN + xi.j];

      out[row * outW + col] = sampleBilinear(data, srcW, srcH, sc, sr, nodata);
    }
  }

  return { data: out, width: outW, height: outH, boundsWgs84: [minLng, minLat, maxLng, maxLat] };
}

/** Split a grid-space coordinate into the two enclosing indices + lower weight. */
function interpAxis(g: number, size: number): { i: number; j: number; f: number } {
  let t = g;
  if (t < 0) t = 0;
  if (t > size - 1) t = size - 1;
  const i = Math.floor(t);
  const j = Math.min(size - 1, i + 1);
  return { i, j, f: t - i };
}

/** Bilinear sample of `data` at source-grid position (col, row), NaN-aware. */
function sampleBilinear(
  data: Float32Array,
  w: number,
  h: number,
  col: number,
  row: number,
  nodata: number | undefined,
): number {
  if (col < -0.5 || col > w - 0.5 || row < -0.5 || row > h - 0.5) return NaN;
  const c0 = Math.floor(col);
  const r0 = Math.floor(row);
  const fx = col - c0;
  const fy = row - r0;

  let acc = 0;
  let weight = 0;
  for (let dr = 0; dr <= 1; dr++) {
    const rr = r0 + dr;
    if (rr < 0 || rr >= h) continue;
    for (let dc = 0; dc <= 1; dc++) {
      const cc = c0 + dc;
      if (cc < 0 || cc >= w) continue;
      const v = data[rr * w + cc];
      if (!Number.isFinite(v)) continue;
      if (nodata !== undefined && v === nodata) continue;
      const wt = (dc === 0 ? 1 - fx : fx) * (dr === 0 ? 1 - fy : fy);
      acc += v * wt;
      weight += wt;
    }
  }
  return weight > 0 ? acc / weight : NaN;
}
