import type { FileSourceDef } from './engine.fileSource.types';
import type { DataFeature } from './engine.feature.types';

const COORD_PRECISION = 9;

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function pointFeature(lng: number, lat: number, props: Record<string, unknown>, index: number, def: FileSourceDef): DataFeature {
  return {
    id: makeId(),
    geometryKind: 'point',
    category: def.category,
    label: `${def.name} ${index + 1}`,
    visible: true,
    geojson: {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [lng, lat] },
      properties: props,
    } as unknown as GeoJSON.Feature,
    data: props,
  };
}

export function parseCsvToFeatures(
  def: FileSourceDef,
  text: string,
  coordTransform?: (x: number, y: number) => [number, number],
): DataFeature[] {
  const lines = text.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0]!.split(',').map((h) => h.trim().toLowerCase());
  const mapping = def.csvMapping;
  if (!mapping) return [];

  const xIdx = header.indexOf(mapping.xColumn.toLowerCase());
  const yIdx = header.indexOf(mapping.yColumn.toLowerCase());
  if (xIdx === -1 || yIdx === -1) return [];

  const propCols = (mapping.propertyColumns ?? []).map((col) => ({
    name: col,
    idx: header.indexOf(col.toLowerCase()),
  })).filter((c) => c.idx !== -1);

  const features: DataFeature[] = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i]!.split(',').map((c) => c.trim());
    const x = parseFloat(cols[xIdx]!);
    const y = parseFloat(cols[yIdx]!);
    if (isNaN(x) || isNaN(y)) continue;

    const [lng, lat] = coordTransform ? coordTransform(x, y) : [x, y];
    const rLng = roundCoord(lng);
    const rLat = roundCoord(lat);
    const props: Record<string, unknown> = {};
    for (const col of propCols) {
      const val = cols[col.idx];
      if (val !== undefined) {
        const num = parseFloat(val);
        props[col.name] = isNaN(num) ? val : num;
      }
    }

    features.push(pointFeature(rLng, rLat, props, features.length, def));
  }

  return features;
}

function roundCoord(n: number): number {
  const f = 10 ** COORD_PRECISION;
  return Math.round(n * f) / f;
}

export function parseGeoJsonToFeatures(
  def: FileSourceDef,
  data: object,
): DataFeature[] {
  const obj = data as Record<string, unknown>;
  let featureList: Record<string, unknown>[] = [];

  if (obj.type === 'FeatureCollection' && Array.isArray(obj.features)) {
    featureList = obj.features as Record<string, unknown>[];
  } else if (obj.type === 'Feature') {
    featureList = [obj];
  }

  const features: DataFeature[] = [];

  for (const gj of featureList) {
    const geom = gj.geometry as { type?: string; coordinates?: number[] } | undefined;
    if (!geom?.type || !geom?.coordinates) continue;

    const props = (gj.properties ?? {}) as Record<string, unknown>;
    let geometryKind: DataFeature['geometryKind'] = 'point';

    if (geom.type === 'LineString' || geom.type === 'MultiLineString') geometryKind = 'linestring';
    else if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') geometryKind = 'polygon';

    features.push({
      id: makeId(),
      geometryKind,
      category: def.category,
      label: `${def.name} ${features.length + 1}`,
      visible: true,
      geojson: gj as unknown as GeoJSON.Feature,
      data: props,
    });
  }

  return features;
}
