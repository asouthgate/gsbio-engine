import type { LngLat } from './spatial';
import type { MapLayerEnvelope } from './spatial.types';

export type GeometryKind = 'point' | 'linestring' | 'polygon' | 'circle' | 'multipoint';

export type DrawMode = 'select' | GeometryKind;

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
  /** Optional raster overlay rendered on the map alongside the vector. */
  raster?: MapLayerEnvelope;
}

export interface FeatureState {
  features: DataFeature[];
  selectedFeatureId: string | null;
}

export interface FeatureMapActions {
  addFeatureToMap: (id: string, geojson: GeoJSON.Feature, raster?: MapLayerEnvelope) => void;
  removeFeatureFromMap: (id: string) => void;
  setFeatureVisibility: (id: string, visible: boolean, geojson: GeoJSON.Feature, raster?: MapLayerEnvelope) => void;
  updateFeatureGeometry: (id: string, geojson: GeoJSON.Feature) => void;
}
