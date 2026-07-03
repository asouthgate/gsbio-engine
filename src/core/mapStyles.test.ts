import { describe, it, expect } from 'vitest';
import { createPmtilesStyle } from './mapStyles';

describe('PMTiles support', () => {
  it('createPmtilesStyle returns an OpenMapTiles vector style pointing at the pmtiles URL', () => {
    const style = createPmtilesStyle('https://example.com/basemap.pmtiles');

    expect(style.version).toBe(8);
    expect(style.sources.openmaptiles.type).toBe('vector');
    expect(style.sources.openmaptiles.tiles).toEqual([
      'pmtiles://https://example.com/basemap.pmtiles/{z}/{x}/{y}',
    ]);
    // The unbundled Natural Earth raster relief source must be stripped.
    expect(style.sources).not.toHaveProperty('natural_earth_shaded_relief');
    // And its layer must not survive.
    expect(
      style.layers.find((l) => l.id === 'natural_earth'),
    ).toBeUndefined();
    // The vector basemap should expose real renderable layers.
    expect(style.layers.length).toBeGreaterThan(1);
    expect(style.layers.some((l) => l.source === 'openmaptiles')).toBe(true);
  });

  it('createPmtilesStyle works with relative URLs', () => {
    const style = createPmtilesStyle('/api/pmtiles/uk.pmtiles');

    expect(style.sources.openmaptiles.tiles).toEqual([
      'pmtiles:///api/pmtiles/uk.pmtiles/{z}/{x}/{y}',
    ]);
  });

  it('PMTiles class can be instantiated with a custom Source', async () => {
    const { PMTiles } = await import('pmtiles');
    const source = {
      getKey: () => 'test',
      getBytes: async () => ({ data: new ArrayBuffer(0) }),
    };
    const pmtiles = new PMTiles(source);
    expect(pmtiles).toBeDefined();
  });
});