import { describe, it, expect } from 'vitest';
import { createPmtilesStyle } from './mapStyles';
import { OSM_LIBERTY_STYLE } from '../styles';

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
    const style = createPmtilesStyle(OSM_LIBERTY_STYLE, '/api/pmtiles/uk.pmtiles');

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