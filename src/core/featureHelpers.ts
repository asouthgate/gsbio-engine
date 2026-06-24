import type { DataFeature } from './types';

export function replaceGeometry(feature: DataFeature, geometry: GeoJSON.Geometry): GeoJSON.Feature {
  return { ...feature.geojson, geometry };
}

export function featuresByCategory(features: ReadonlyArray<DataFeature>, category: string): DataFeature[] {
  return features.filter((f) => f.category === category);
}
