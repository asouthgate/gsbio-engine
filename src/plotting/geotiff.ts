// Minimal single-band float32 GeoTIFF encoder.
//
// Used to give client-computed rasters (roost loss surface, browser resistance)
// the same raw, scientific download artifact as server-produced layers. Writes
// an uncompressed, little-endian, north-up GeoTIFF with ModelPixelScale,
// ModelTiepoint and a GeoKeyDirectory for the target projected CRS (default
// EPSG:27700 British National Grid).

export interface GeoTiffOptions {
  /** Raster bounds in the target CRS: [xmin, ymin, xmax, ymax]. */
  bounds: [number, number, number, number];
  /** EPSG code for the projected CRS. Defaults to 27700 (BNG). */
  epsg?: number;
  /** Raster nodata value. Defaults to -9999. */
  nodata?: number;
}

export interface GeoTiffGrid {
  data: Float32Array;
  width: number;
  height: number;
}

interface IfdEntry {
  tag: number;
  type: number;
  count: number;
  /** Inline value (fits in 4 bytes) or offset into the extra-data block. */
  value: number;
  /** Bytes to append to the extra-data block for this entry. */
  extra?: Uint8Array;
}

const TYPE_SHORT = 3;
const TYPE_LONG = 4;
const TYPE_DOUBLE = 12;

/**
 * Encode a north-up float32 grid as a GeoTIFF. Row 0 maps to the north edge
 * (`ymax`) and column 0 to the west edge (`xmin`).
 */
export function encodeGeoTiff(grid: GeoTiffGrid, opts: GeoTiffOptions): ArrayBuffer {
  const { data, width, height } = grid;
  if (data.length !== width * height) {
    throw new Error(`encodeGeoTiff: data length ${data.length} != ${width}x${height}`);
  }
  const [xmin, ymin, xmax, ymax] = opts.bounds;
  const epsg = opts.epsg ?? 27700;
  const pixelX = width > 0 ? (xmax - xmin) / width : 0;
  const pixelY = height > 0 ? (ymax - ymin) / height : 0;

  // Extra data blocks.
  const pixelScale = doubles([pixelX, pixelY, 0]);
  const tiepoint = doubles([0, 0, 0, xmin, ymax, 0]);
  // GeoKeyDirectory: header [version, revision, minor, numKeys], then keys
  // (GTModelType=2 projected, GTRasterType=1 PixelIsArea, ProjectedCSType=epsg).
  const geoKeys = shorts([
    1, 1, 0, 3,
    1024, 0, 1, 2,
    1025, 0, 1, 1,
    3072, 0, 1, epsg,
  ]);
  const extras = [pixelScale, tiepoint, geoKeys];
  const extraLen = extras.reduce((a, b) => a + b.length, 0);

  const ifdOffset = 8;
  const entryCount = 14;
  const ifdSize = 2 + entryCount * 12 + 4;
  let extraOffset = ifdOffset + ifdSize;
  if (extraOffset % 2 !== 0) extraOffset += 1;
  const imageOffset = extraOffset + extraLen + (extraLen % 2 === 0 ? 0 : 1);
  const total = imageOffset + data.length * 4;

  const buffer = new ArrayBuffer(total);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  // Header: little-endian TIFF.
  view.setUint8(0, 0x49); // 'I'
  view.setUint8(1, 0x49);
  view.setUint16(2, 42, true);
  view.setUint32(4, ifdOffset, true);

  const entries: IfdEntry[] = [
    { tag: 256, type: TYPE_LONG, count: 1, value: width }, // ImageWidth
    { tag: 257, type: TYPE_LONG, count: 1, value: height }, // ImageLength
    { tag: 258, type: TYPE_SHORT, count: 1, value: 32 }, // BitsPerSample
    { tag: 259, type: TYPE_SHORT, count: 1, value: 1 }, // Compression (none)
    { tag: 262, type: TYPE_SHORT, count: 1, value: 1 }, // Photometric (BlackIsZero)
    { tag: 273, type: TYPE_LONG, count: 1, value: imageOffset }, // StripOffsets
    { tag: 277, type: TYPE_SHORT, count: 1, value: 1 }, // SamplesPerPixel
    { tag: 278, type: TYPE_LONG, count: 1, value: height }, // RowsPerStrip
    { tag: 279, type: TYPE_LONG, count: 1, value: data.length * 4 }, // StripByteCounts
    { tag: 284, type: TYPE_SHORT, count: 1, value: 1 }, // PlanarConfiguration
    { tag: 339, type: TYPE_SHORT, count: 1, value: 3 }, // SampleFormat (IEEE float)
    { tag: 33550, type: TYPE_DOUBLE, count: 3, value: 0, extra: pixelScale }, // ModelPixelScale
    { tag: 33922, type: TYPE_DOUBLE, count: 6, value: 0, extra: tiepoint }, // ModelTiepoint
    { tag: 34735, type: TYPE_SHORT, count: geoKeys.length / 2, value: 0, extra: geoKeys }, // GeoKeyDirectory
  ];

  // Resolve extra offsets and write entry table.
  let cursor = extraOffset;
  view.setUint16(ifdOffset, entries.length, true);
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const at = ifdOffset + 2 + i * 12;
    view.setUint16(at, e.tag, true);
    view.setUint16(at + 2, e.type, true);
    view.setUint32(at + 4, e.count, true);
    if (e.extra) {
      view.setUint32(at + 8, cursor, true);
      bytes.set(e.extra, cursor);
      cursor += e.extra.length;
    } else if (e.type === TYPE_SHORT) {
      view.setUint16(at + 8, e.value, true);
      view.setUint16(at + 10, 0, true);
    } else {
      view.setUint32(at + 8, e.value, true);
    }
  }
  view.setUint32(ifdOffset + 2 + entries.length * 12, 0, true); // next IFD

  // Pixel data (little-endian float32).
  for (let i = 0; i < data.length; i++) {
    view.setFloat32(imageOffset + i * 4, data[i], true);
  }

  return buffer;
}

function doubles(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 8);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setFloat64(i * 8, v, true));
  return out;
}

function shorts(values: number[]): Uint8Array {
  const out = new Uint8Array(values.length * 2);
  const view = new DataView(out.buffer);
  values.forEach((v, i) => view.setUint16(i * 2, v, true));
  return out;
}
