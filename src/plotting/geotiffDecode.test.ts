import { describe, it, expect } from 'vitest';
import { encodeGeoTiff } from './geotiff';
import { decodeGeoTiff } from './geotiffDecode';
import { alignRasterToGrid, type TargetGrid } from './projection';

describe('decodeGeoTiff', () => {
  it('round-trips a BNG grid produced by encodeGeoTiff', async () => {
    const data = new Float32Array([1, 2, 3, 4]);
    const bounds: [number, number, number, number] = [100, 200, 120, 220];
    const buffer = encodeGeoTiff({ data, width: 2, height: 2 }, { bounds });

    const decoded = await decodeGeoTiff(buffer);
    expect(decoded.width).toBe(2);
    expect(decoded.height).toBe(2);
    expect(decoded.crs).toBe('EPSG:27700');
    expect(decoded.bounds).toEqual(bounds);
    for (let i = 0; i < data.length; i++) {
      expect(decoded.data[i]).toBeCloseTo(data[i], 5);
    }
  });
});

describe('alignRasterToGrid', () => {
  // Source: 2x2 BNG raster, 10m pixels, bounds [100, 200, 120, 220].
  const raster = {
    data: new Float32Array([1, 2, 3, 4]),
    width: 2,
    height: 2,
    bounds: [100, 200, 120, 220] as [number, number, number, number],
    crs: 'EPSG:27700' as const,
  };

  it('propagates a constant source raster', () => {
    const constant = { ...raster, data: new Float32Array([5, 5, 5, 5]) };
    const grid: TargetGrid = { m: 2, n: 2, pixw: 10, xmin: 100, ymin: 200, xmax: 120, ymax: 220 };
    expect([...alignRasterToGrid(constant, grid)]).toEqual([5, 5, 5, 5]);
  });

  it('bilinearly interpolates at a target cell centre', () => {
    // Cell centre at source index (0.25, 0.25) -> 0.5625*1 + 0.1875*2 + 0.1875*3 + 0.0625*4 = 1.75
    const grid: TargetGrid = { m: 1, n: 1, pixw: 10, xmin: 97.5, ymin: 212.5, xmax: 107.5, ymax: 222.5 };
    expect(alignRasterToGrid(raster, grid)[0]).toBeCloseTo(1.75, 5);
  });

  it('returns NaN when the cell centre lies outside the source footprint', () => {
    const grid: TargetGrid = { m: 1, n: 1, pixw: 10, xmin: 0, ymin: 0, xmax: 10, ymax: 10 };
    expect(Number.isNaN(alignRasterToGrid(raster, grid)[0])).toBe(true);
  });
});
