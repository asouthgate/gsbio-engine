import { describe, it, expect } from 'vitest';
import {
  computeDomain,
  normalizeValue,
  computeTicks,
  invertTransform,
  expandBoundsForMargins,
  projectToPixel,
} from './raster';
import { paletteLUT } from './palettes';

describe('computeDomain', () => {
  it('uses finite values and honours nodata', () => {
    const data = new Float32Array([1, 2, -9999, 4, NaN]);
    expect(computeDomain(data, { nodata: -9999 })).toEqual([1, 4]);
  });

  it('honours explicit bounds', () => {
    expect(computeDomain(new Float32Array([1, 2, 3]), { vmin: 0, vmax: 10 })).toEqual([0, 10]);
  });

  it('ignores non-positive values in log scale', () => {
    expect(computeDomain(new Float32Array([-1, 1, 10, 100]), { scale: 'log' })).toEqual([1, 100]);
  });
});

describe('normalizeValue', () => {
  it('maps linearly', () => {
    expect(normalizeValue(0, 0, 10)).toBe(0);
    expect(normalizeValue(5, 0, 10)).toBe(0.5);
    expect(normalizeValue(20, 0, 10)).toBe(1);
  });

  it('maps logarithmically and clamps', () => {
    expect(normalizeValue(1, 1, 100, 'log')).toBe(0);
    expect(normalizeValue(10, 1, 100, 'log')).toBeCloseTo(0.5, 6);
    expect(normalizeValue(0, 1, 100, 'log')).toBe(0);
  });
});

describe('computeTicks', () => {
  it('returns powers of ten for log scale', () => {
    expect(computeTicks(1, 1000, 'log', 5)).toEqual([1, 10, 100, 1000]);
  });

  it('returns evenly spaced ticks for linear scale', () => {
    expect(computeTicks(0, 100, 'linear', 5)).toEqual([0, 25, 50, 75, 100]);
  });
});

describe('invertTransform', () => {
  it('inverts pre-applied transforms', () => {
    expect(invertTransform(Math.log1p(4), 'log1p')).toBeCloseTo(4, 10);
    expect(invertTransform(3, 'log10')).toBeCloseTo(1000, 10);
    expect(invertTransform(2, 'none')).toBe(2);
  });
});

describe('expandBoundsForMargins', () => {
  it('extends each side so the data region keeps its bounds', () => {
    const out = expandBoundsForMargins([0, 0, 100, 100], 10, 10, { left: 1, right: 2, top: 1, bottom: 2 });
    // dx = dy = 100/9; west shrinks by 1 step, east grows by 2, etc.
    expect(out[0]).toBeCloseTo(-100 / 9, 6);
    expect(out[1]).toBeCloseTo(-200 / 9, 6);
    expect(out[2]).toBeCloseTo(100 + 200 / 9, 6);
    expect(out[3]).toBeCloseTo(100 + 100 / 9, 6);
  });
});

describe('projectToPixel', () => {
  it('maps corners', () => {
    const b: [number, number, number, number] = [0, 0, 10, 10];
    expect(projectToPixel(0, 10, b, 11, 11)).toEqual([0, 0]);
    expect(projectToPixel(10, 0, b, 11, 11)).toEqual([10, 10]);
  });
});

describe('paletteLUT', () => {
  it('preserves endpoints', () => {
    const magma = paletteLUT('magma', 4);
    const roost = paletteLUT('roost-loss', 2);
    expect(magma.length).toBe(12);
    expect(roost[0]).toBe(36);
    expect(roost[3]).toBe(250);
  });

  it('interpolates explicit stop arrays', () => {
    const lut = paletteLUT([[0, 0, 0], [10, 20, 30]], 2);
    expect(Array.from(lut)).toEqual([0, 0, 0, 10, 20, 30]);
  });
});
