import { describe, it, expect } from 'vitest';
import { createPmtilesStyle } from './mapStyles';
import { resolvePaletteTokens } from './resolvePalette';
import { STYLE_TEMPLATE, DEFAULT_PALETTE } from '../styles';
import type { MapPalette } from '../styles/palette';

const SIMPLE_STYLE = {
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', url: 'https://example.com/tiles.json' },
  },
  layers: [{ id: 'background', type: 'background' }],
};

describe('PMTiles support', () => {
  it('createPmtilesStyle patches the openmaptiles source with a pmtiles:// URL', () => {
    const style = createPmtilesStyle(SIMPLE_STYLE, 'https://example.com/basemap.pmtiles');

    expect(style.version).toBe(8);
    expect(style.sources.openmaptiles.type).toBe('vector');
    expect(style.sources.openmaptiles.tiles).toEqual([
      'pmtiles://https://example.com/basemap.pmtiles/{z}/{x}/{y}',
    ]);
    expect(style.sources.openmaptiles.minzoom).toBe(0);
    expect(style.sources.openmaptiles.maxzoom).toBe(14);
  });

  it('createPmtilesStyle works with relative URLs', () => {
    const style = createPmtilesStyle(SIMPLE_STYLE, '/api/pmtiles/uk.pmtiles');

    expect(style.sources.openmaptiles.tiles).toEqual([
      'pmtiles:///api/pmtiles/uk.pmtiles/{z}/{x}/{y}',
    ]);
  });

  it('createPmtilesStyle honours custom min/max zoom and sourceName options', () => {
    const customStyle = {
      version: 8,
      sources: { mySource: { type: 'vector', url: 'https://x.com/t.json' } },
      layers: [],
    };
    const style = createPmtilesStyle(customStyle, '/api/pmtiles/uk.pmtiles', {
      minzoom: 5,
      maxzoom: 12,
      sourceName: 'mySource',
    });

    expect(style.sources.mySource.minzoom).toBe(5);
    expect(style.sources.mySource.maxzoom).toBe(12);
    expect(style.sources.mySource.tiles).toEqual([
      'pmtiles:///api/pmtiles/uk.pmtiles/{z}/{x}/{y}',
    ]);
  });

  it('createPmtilesStyle preserves layers from the input style', () => {
    const style = createPmtilesStyle(STYLE_TEMPLATE, '/api/pmtiles/uk.pmtiles');

    expect(style.layers.length).toBeGreaterThan(1);
    expect(style.layers.some((l: any) => l.source === 'openmaptiles')).toBe(true);
    expect(Object.keys(style.sources)).toEqual(['openmaptiles']);
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

describe('resolvePaletteTokens', () => {
  it('replaces $palette tokens with palette values', () => {
    const resolved: any = resolvePaletteTokens(STYLE_TEMPLATE, DEFAULT_PALETTE);

    expect(resolved.layers[0].paint['background-color']).toBe(DEFAULT_PALETTE.background);
  });

  it('replaces tokens inside nested arrays (zoom stops)', () => {
    const resolved: any = resolvePaletteTokens(STYLE_TEMPLATE, DEFAULT_PALETTE);
    const resLayer = resolved.layers.find((l: any) => l.id === 'landuse_residential');

    const stops: any[] = resLayer.paint['fill-color'].stops;
    expect(stops[0][1]).toBe(DEFAULT_PALETTE.land);
    expect(stops[1][1]).toBe(DEFAULT_PALETTE.land);
  });

  it('leaves non-token values unchanged', () => {
    const input = { foo: 'bar', num: 42, arr: [1, 'hello'], nested: { x: true } };
    const output = resolvePaletteTokens(input, DEFAULT_PALETTE);

    expect(output).toEqual(input);
  });

  it('produces a style with no unresolved tokens', () => {
    const resolved = resolvePaletteTokens(STYLE_TEMPLATE, DEFAULT_PALETTE);
    const json = JSON.stringify(resolved);

    expect(json).not.toContain('$palette.');
  });

  it('a custom palette overrides specific keys', () => {
    const custom: MapPalette = { ...DEFAULT_PALETTE, water: '#ff0000' };
    const resolved: any = resolvePaletteTokens(STYLE_TEMPLATE, custom);
    const waterLayer = resolved.layers.find((l: any) => l.id === 'water');

    expect(waterLayer.paint['fill-color']).toBe('#ff0000');
  });

  it('composition with createPmtilesStyle works end-to-end', () => {
    const resolved = resolvePaletteTokens(STYLE_TEMPLATE, DEFAULT_PALETTE);
    const style = createPmtilesStyle(resolved, '/api/pmtiles/uk.pmtiles');

    expect(style.layers.length).toBeGreaterThan(1);
    expect(style.sources.openmaptiles.tiles[0]).toContain('pmtiles://');
    expect(JSON.stringify(style)).not.toContain('$palette.');
  });
});