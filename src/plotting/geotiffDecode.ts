// Single-band GeoTIFF decoding.
//
// Mirrors `encodeGeoTiff` (the writer) so the engine can also *read* raster
// inputs such as user-supplied light maps. Decodes band 0 into a north-up
// float32 grid with its georeferencing; resampling onto a target BNG grid is
// handled by `alignRasterToGrid` in `projection.ts`.

import { fromArrayBuffer } from 'geotiff';
import type { NativeRasterGrid, RasterCrs } from './projection';

/** A decoded raster; structurally identical to `NativeRasterGrid`. */
export type DecodedRaster = NativeRasterGrid;

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
