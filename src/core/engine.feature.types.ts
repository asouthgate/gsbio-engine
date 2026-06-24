import type { LngLat } from './spatial';

export type GeometryKind = 'point' | 'linestring' | 'polygon' | 'circle';

export interface CircleGeometry {
  center: LngLat;
  radiusMeters: number;
}

export interface DataFeature {
  id: string;
  geometryKind: GeometryKind;
  category: string;
  label: string;
  visible: boolean;
  geojson: GeoJSON.Feature;
  circle?: CircleGeometry;
  data?: Record<string, unknown>;
}

export interface FeatureState {
  features: DataFeature[];
  selectedFeatureId: string | null;
}

export interface FeatureMapActions {
  removeFeatureFromMap: (id: string) => void;
  setFeatureVisibility: (id: string, visible: boolean, geojson: GeoJSON.Feature) => void;
  updateFeatureGeometry: (id: string, geojson: GeoJSON.Feature) => void;
}
