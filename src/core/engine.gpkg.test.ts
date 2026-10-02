import { describe, it, expect } from 'vitest';
import { decodeGpkgFeature } from './engine.gpkg';

const feature = (gj: object): GeoJSON.Feature => gj as unknown as GeoJSON.Feature;

describe('decodeGpkgFeature', () => {
  it('decodes a round-tripped MultiPoint lights feature', () => {
    const meta = decodeGpkgFeature(feature({
      type: 'Feature',
      geometry: { type: 'MultiPoint', coordinates: [[-3.6, 50.604], [-3.61, 50.605]] },
      properties: {
        _dp_category: 'Lights',
        _dp_label: 'Street Lights 1',
        _dp_data: JSON.stringify({ heights: [5, 6] }),
        _dp_circle: 'null',
      },
    }));

    expect(meta.geometryKind).toBe('multipoint');
    expect(meta.category).toBe('Lights');
    expect(meta.label).toBe('Street Lights 1');
    expect(meta.data).toEqual({ heights: [5, 6] });
    expect(meta.circle).toBeUndefined();
    expect(meta.geojson.properties).toEqual({});
    expect(meta.geojson.geometry).toEqual({
      type: 'MultiPoint',
      coordinates: [[-3.6, 50.604], [-3.61, 50.605]],
    });
  });

  it('decodes a polygon feature with scalar data', () => {
    const meta = decodeGpkgFeature(feature({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: {
        _dp_category: 'Building',
        _dp_label: 'B1',
        _dp_data: JSON.stringify({ height: 12 }),
        _dp_circle: 'null',
      },
    }));

    expect(meta.geometryKind).toBe('polygon');
    expect(meta.category).toBe('Building');
    expect(meta.data).toEqual({ height: 12 });
  });

  it('decodes a circular feature', () => {
    const circle = { center: { lng: -3.5, lat: 50.5 }, radiusMeters: 100 };
    const meta = decodeGpkgFeature(feature({
      type: 'Feature',
      geometry: { type: 'Polygon', coordinates: [] },
      properties: {
        _dp_category: 'Roost',
        _dp_label: '',
        _dp_data: 'null',
        _dp_circle: JSON.stringify(circle),
      },
    }));

    expect(meta.circle).toEqual(circle);
    expect(meta.data).toBeUndefined();
  });

  it('maps a missing _dp_data to undefined data', () => {
    const meta = decodeGpkgFeature(feature({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { _dp_category: 'Lights', _dp_label: '', _dp_data: 'null', _dp_circle: 'null' },
    }));

    expect(meta.data).toBeUndefined();
    expect(meta.circle).toBeUndefined();
    expect(meta.geometryKind).toBe('point');
  });

  it('leaves metadata absent for a file not produced by writeGpkg', () => {
    const meta = decodeGpkgFeature(feature({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [0, 0] },
      properties: { height: 5 },
    }));

    expect(meta.category).toBeUndefined();
    expect(meta.label).toBeUndefined();
    expect(meta.data).toBeUndefined();
    expect(meta.circle).toBeUndefined();
  });
});
