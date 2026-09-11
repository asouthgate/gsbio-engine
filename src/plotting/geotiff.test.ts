import { describe, it, expect } from 'vitest';
import { encodeGeoTiff } from './geotiff';

function ifdEntries(view: DataView) {
  const ifd = view.getUint32(4, true);
  const count = view.getUint16(ifd, true);
  const map = new Map<number, { type: number; count: number; value: number; at: number }>();
  for (let i = 0; i < count; i++) {
    const at = ifd + 2 + i * 12;
    map.set(view.getUint16(at, true), {
      type: view.getUint16(at + 2, true),
      count: view.getUint32(at + 4, true),
      value: view.getUint32(at + 8, true),
      at,
    });
  }
  return map;
}

describe('encodeGeoTiff', () => {
  const data = new Float32Array([1, 2, 3, 4]);
  const buffer = encodeGeoTiff({ data, width: 2, height: 2 }, { bounds: [100, 200, 120, 220] });
  const view = new DataView(buffer);
  const entries = ifdEntries(view);

  it('writes a little-endian TIFF header', () => {
    expect(view.getUint8(0)).toBe(0x49);
    expect(view.getUint8(1)).toBe(0x49);
    expect(view.getUint16(2, true)).toBe(42);
  });

  it('writes grid dimensions and sample format', () => {
    expect(entries.get(256)?.value).toBe(2);
    expect(entries.get(257)?.value).toBe(2);
    expect(entries.get(258)?.value).toBe(32);
    expect(entries.get(339)?.value).toBe(3);
  });

  it('round-trips pixel values at the strip offset', () => {
    const offset = entries.get(273)!.value;
    for (let i = 0; i < data.length; i++) {
      expect(view.getFloat32(offset + i * 4, true)).toBe(data[i]);
    }
  });

  it('encodes the projected CRS geo-key', () => {
    const geo = entries.get(34735)!;
    const keys = view.getUint16(geo.value + 6, true); // numKeys (after 4-short header)
    expect(keys).toBe(3);
    // header (8 bytes) + key[2] (3072, 0, 1, value)
    const projKeyAt = geo.value + 8 + 2 * 8 + 6;
    expect(view.getUint16(projKeyAt, true)).toBe(27700);
  });
});
