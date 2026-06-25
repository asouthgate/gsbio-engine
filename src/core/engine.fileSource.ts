import type { FileSourceDef } from './engine.fileSource.types';
import type { DataFeature } from './engine.feature.types';

const COORD_PRECISION = 9;

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `f-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
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
