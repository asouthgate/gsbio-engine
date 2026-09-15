import { describe, it, expect } from 'vitest';
import {
  bngToWgs84LngLat,
  wgs84ToBng,
  bngExtentToWgs84Corners,
  reprojectGridToWgs84,
} from './projection';

describe('projection point transforms', () => {
  it('round-trips BNG <-> WGS84', () => {
    const [lng, lat] = bngToWgs84LngLat(300500, 60500);
    const [easting, northing] = wgs84ToBng(lat, lng);
    expect(easting).toBeCloseTo(300500, 2);
    expect(northing).toBeCloseTo(60500, 2);
  });

  it('matches a known BNG -> WGS84 coordinate', () => {
    const [lng, lat] = bngToWgs84LngLat(300500, 60500);
    expect(lng).toBeCloseTo(-3.402412595, 6);
    expect(lat).toBeCloseTo(50.435889727, 6);
  });
});

describe('bngExtentToWgs84Corners', () => {
  const bounds: [number, number, number, number] = [287500, 77500, 288500, 78500];

  it('reprojects all four corners in clockwise order', () => {
    const c = bngExtentToWgs84Corners(bounds);
    expect(c[0]).toEqual(bngToWgs84LngLat(287500, 78500)); // TL
    expect(c[1]).toEqual(bngToWgs84LngLat(288500, 78500)); // TR
    expect(c[2]).toEqual(bngToWgs84LngLat(288500, 77500)); // BR
    expect(c[3]).toEqual(bngToWgs84LngLat(287500, 77500)); // BL
  });

  it('preserves the grid rotation (not an axis-aligned box)', () => {
    const c = bngExtentToWgs84Corners(bounds);
    expect(c[0][1]).not.toBeCloseTo(c[1][1], 6);
    expect(c[0][0]).not.toBeCloseTo(c[3][0], 6);
  });
});

describe('reprojectGridToWgs84', () => {
  const bounds: [number, number, number, number] = [287500, 77500, 288500, 78500];

  it('passes EPSG:4326 grids through unchanged', () => {
    const data = new Float32Array([1, 2, 3, 4]);
    const out = reprojectGridToWgs84({ data, width: 2, height: 2, crs: 'EPSG:4326', bounds });
    expect(out).toEqual({ data, width: 2, height: 2, boundsWgs84: bounds });
  });

  it('reprojects a BNG grid onto an axis-aligned WGS84 box', () => {
    const w = 100;
    const h = 100;
    const data = new Float32Array(w * h).fill(1);
    const out = reprojectGridToWgs84({ data, width: w, height: h, crs: 'EPSG:27700', bounds });
    const [west, south, east, north] = out.boundsWgs84;
    expect(west).toBeLessThan(east);
    expect(south).toBeLessThan(north);
    // The rotated footprint leaves NaN in the box corners, but the centre is finite.
    expect(out.data[Math.floor(out.height / 2) * out.width + Math.floor(out.width / 2)]).toBe(1);
    expect(Number.isNaN(out.data[0])).toBe(true); // top-left corner lies outside the rotated quad
  });

  it('places a source-centre marker at the projected centre', () => {
    const w = 100;
    const h = 100;
    const data = new Float32Array(w * h).fill(0);
    data[Math.floor(h / 2) * w + Math.floor(w / 2)] = 42;
    const out = reprojectGridToWgs84({ data, width: w, height: h, crs: 'EPSG:27700', bounds });

    const [easting, northing] = [(bounds[0] + bounds[2]) / 2, (bounds[1] + bounds[3]) / 2];
    const [lng, lat] = bngToWgs84LngLat(easting, northing);
    const [west, south, east, north] = out.boundsWgs84;
    const col = Math.floor(((lng - west) / (east - west)) * out.width);
    const row = Math.floor(((north - lat) / (north - south)) * out.height);
    expect(out.data[row * out.width + col]).toBeGreaterThan(0);
  });

  it('converges as the coarse grid resolution increases', () => {
    // A large extent makes the TM non-linearity significant enough that the
    // coarse interpolation grid actually matters.
    const largeBounds: [number, number, number, number] = [200000, 200000, 400000, 400000];
    const w = 200;
    const h = 200;
    const data = new Float32Array(w * h).fill(0);
    data[Math.floor(h / 2) * w + Math.floor(w / 2)] = 42;

    const markerPeak = (out: ReturnType<typeof reprojectGridToWgs84>) => {
      let peak = 0;
      let maxV = -Infinity;
      for (let i = 0; i < out.data.length; i++) {
        if (out.data[i] > maxV) { maxV = out.data[i]; peak = i; }
      }
      return { col: peak % out.width, row: Math.floor(peak / out.width), maxV };
    };

    const fine = markerPeak(reprojectGridToWgs84({ data, width: w, height: h, crs: 'EPSG:27700', bounds: largeBounds }, 65));
    const coarse = markerPeak(reprojectGridToWgs84({ data, width: w, height: h, crs: 'EPSG:27700', bounds: largeBounds }, 2));

    // The marker is still the brightest spot, but a 2x2 inverse grid misplaces it.
    expect(fine.maxV).toBeGreaterThan(0);
    expect(coarse.maxV).toBeGreaterThan(0);
    expect(Math.hypot(fine.col - coarse.col, fine.row - coarse.row)).toBeGreaterThan(0.5);
  });

  it('caps output dimensions proportionally and honours a custom maxDim', () => {
    const w = 100;
    const h = 100;
    const data = new Float32Array(w * h).fill(1);
    const base = reprojectGridToWgs84({ data, width: w, height: h, crs: 'EPSG:27700', bounds });

    // Override the cap well below the natural size and check aspect is preserved.
    const capped = reprojectGridToWgs84(
      { data, width: w, height: h, crs: 'EPSG:27700', bounds },
      33,
      64,
    );
    expect(Math.max(capped.width, capped.height)).toBeLessThanOrEqual(64);
    const baseAspect = base.width / base.height;
    const cappedAspect = capped.width / capped.height;
    expect(cappedAspect).toBeCloseTo(baseAspect, 1);
  });
});
