import type { LngLat } from './spatial';

export type GeometryKind = 'point' | 'linestring' | 'polygon' | 'circle';
export type DrawMode = 'select' | GeometryKind;

export interface CircleGeometry {
  center: LngLat;
  radiusMeters: number;
}

export interface DrawnFeature {
  id: string;
  geometryKind: GeometryKind;
  category: string;
  label: string;
  visible: boolean;
  geojson: GeoJSON.Feature;
  // Special handling for circle types
  circle?: CircleGeometry;
}

export interface DrawMapActions {
  removeFeatureFromMap: (id: string) => void;
  setFeatureVisibility: (id: string, visible: boolean, geojson: GeoJSON.Feature) => void;
  updateFeatureGeometry: (id: string, geojson: GeoJSON.Feature) => void;
}
