// Single-band GeoTIFF decoding + resampling helpers.
//
// Mirrors `encodeGeoTiff` (the writer) so the engine can also *read* raster
// inputs such as user-supplied light maps. Decodes band 0 into a north-up
// float32 grid and can resample it onto a target BNG grid, reprojecting from
// WGS84 when the source CRS is geographic.

import { fromArrayBuffer } from 'geotiff';
import { bngToWgs84LngLat, type RasterCrs } from './projection';

export interface DecodedRaster {
  data: Float32Array;
  width: number;
  height: number;
  /** [xmin, ymin, xmax, ymax] in `crs`. */
  bounds: [number, number, number, number];
  crs: RasterCrs;
  nodata?: number;
}

/** A north-up BNG grid definition that a raster is aligned onto. */
export interface TargetGrid {
  m: number;
  n: number;
  pixw: number;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

function resolveCrs(projected: number | undefined, geographic: number | undefined): RasterCrs {
  if (projected === 27700) return 'EPSG:27700';
  if (geographic === 4326 || projected === undefined) return 'EPSG:4326';
  if (projected !== undefined) {
    throw new Error(`Unsupported raster CRS EPSG:${projected} (expected EPSG:27700 or EPSG:4326).`);
  }
  return 'EPSG:4326';
}

/**
 * Decode a single-band GeoTIFF (band 0) into a north-up float32 grid with its
 * georeferencing. Only EPSG:27700 (BNG) and EPSG:4326 (WGS84) are supported.
 */
export async function decodeGeoTiff(buffer: ArrayBuffer): Promise<DecodedRaster> {
  const tif = await fromArrayBuffer(buffer);
  const image = await tif.getImage();

  const width = image.getWidth();
  const height = image.getHeight();

  const rasters = await image.readRasters();
  const first = rasters[0] as ArrayLike<number> | undefined;
  const data = first
    ? first instanceof Float32Array
      ? first
      : Float32Array.from(first)
    : new Float32Array(width * height);

  const geoKeys = image.getGeoKeys();
  const crs = resolveCrs(
    geoKeys?.ProjectedCSTypeGeoKey as number | undefined,
    geoKeys?.GeographicTypeGeoKey as number | undefined,
  );

  const bbox = image.getBoundingBox();
  const bounds: [number, number, number, number] = [bbox[0], bbox[1], bbox[2], bbox[3]];

  const nodataRaw = image.getGDALNoData();
  const nodata = nodataRaw !== null && nodataRaw !== undefined ? nodataRaw : undefined;

  return { data, width, height, bounds, crs, nodata };
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

/**
 * Resample a decoded raster onto a north-up BNG grid, bilinearly interpolating
 * and reprojecting from WGS84 when the source CRS is geographic. Returns a
 * `Float32Array` of length `m * n` (row 0 = north edge); cells outside the
 * source footprint are NaN.
 */
export function alignRasterToGrid(raster: DecodedRaster, grid: TargetGrid): Float32Array {
  const { data, width, height, bounds, crs, nodata } = raster;
  const out = new Float32Array(grid.m * grid.n);

  const srcPixW = width > 0 ? (bounds[2] - bounds[0]) / width : 0;
  const srcPixH = height > 0 ? (bounds[3] - bounds[1]) / height : 0;

  for (let row = 0; row < grid.m; row++) {
    const northing = grid.ymax - (row + 0.5) * grid.pixw;
    for (let col = 0; col < grid.n; col++) {
      const easting = grid.xmin + (col + 0.5) * grid.pixw;

      let sx: number;
      let sy: number;
      if (crs === 'EPSG:27700') {
        sx = srcPixW > 0 ? (easting - bounds[0]) / srcPixW : 0;
        sy = srcPixH > 0 ? (bounds[3] - northing) / srcPixH : 0;
      } else {
        const [lng, lat] = bngToWgs84LngLat(easting, northing);
        sx = srcPixW > 0 ? (lng - bounds[0]) / srcPixW : 0;
        sy = srcPixH > 0 ? (bounds[3] - lat) / srcPixH : 0;
      }

      out[row * grid.n + col] = sampleBilinear(data, width, height, sx, sy, nodata);
    }
  }

  return out;
}
