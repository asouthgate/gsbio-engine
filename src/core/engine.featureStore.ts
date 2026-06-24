import type { SimulationEngine } from './engine';
import type { DataFeature, CircleGeometry } from './types';
import {
  circleToPolygon,
  lineStringToGeoJSONFeature,
  polygonRingToGeoJSONFeature,
  COORDINATE_PRECISION,
  type LngLat,
} from './spatial';

export interface FeatureState {
  features: DataFeature[];
  selectedFeatureId: string | null;
}

export type FeatureAction =
  | { type: 'ADD_FEATURE'; payload: DataFeature }
  | { type: 'REMOVE_FEATURE'; payload: string }
  | { type: 'UPDATE_FEATURE'; payload: { id: string; updates: Partial<DataFeature> } }
  | { type: 'SELECT_FEATURE'; payload: string | null }
  | { type: 'CLEAR_ALL' };

export class FeatureStore {
  constructor(private engine: SimulationEngine) {}

  getInitialState(): FeatureState {
    return {
      features: [],
      selectedFeatureId: null,
    };
  }

  reducer(state: FeatureState, action: FeatureAction): FeatureState {
    switch (action.type) {
      case 'ADD_FEATURE':
        return { ...state, features: [...state.features, action.payload] };
      case 'REMOVE_FEATURE':
        return {
          ...state,
          features: state.features.filter((f) => f.id !== action.payload),
          selectedFeatureId: state.selectedFeatureId === action.payload ? null : state.selectedFeatureId,
        };
      case 'UPDATE_FEATURE':
        return {
          ...state,
          features: state.features.map((f) =>
            f.id === action.payload.id ? { ...f, ...action.payload.updates } : f,
          ),
        };
      case 'SELECT_FEATURE':
        return { ...state, selectedFeatureId: action.payload };
      case 'CLEAR_ALL':
        return this.getInitialState();
      default:
        return state;
    }
  }

  removeFeature = (id: string): void => {
    this.engine.dispatchFeature({ type: 'REMOVE_FEATURE', payload: id });
    this.engine.mapActions?.removeFeatureFromMap(id);
  };

  toggleVisibility = (id: string): void => {
    const feature = this.engine.getSnapshot().features.features.find((f: DataFeature) => f.id === id);
    if (!feature) return;
    const visible = !feature.visible;
    this.engine.dispatchFeature({ type: 'UPDATE_FEATURE', payload: { id, updates: { visible } } });
    this.engine.mapActions?.setFeatureVisibility(id, visible, feature.geojson);
  };

  updateCircle = (id: string, patch: Partial<CircleGeometry>): void => {
    const feature = this.engine.getSnapshot().features.features.find((f: DataFeature) => f.id === id);
    if (!feature || !feature.circle) return;
    const circle = { ...feature.circle, ...patch };
    const geojson = this.replaceGeometry(feature, circleToPolygon(circle.center, circle.radiusMeters).geometry);
    this.engine.dispatchFeature({ type: 'UPDATE_FEATURE', payload: { id, updates: { circle, geojson } } });
    this.engine.mapActions?.updateFeatureGeometry(id, geojson);
  };

  updatePointPosition = (id: string, lngLat: LngLat): void => {
    const feature = this.engine.getSnapshot().features.features.find((f: DataFeature) => f.id === id);
    if (!feature || feature.geometryKind !== 'point') return;
    const fRatio = 10 ** COORDINATE_PRECISION;
    const lng = Math.round(lngLat.lng * fRatio) / fRatio;
    const lat = Math.round(lngLat.lat * fRatio) / fRatio;
    const geometry: GeoJSON.Geometry = { type: 'Point', coordinates: [lng, lat] };
    const geojson = this.replaceGeometry(feature, geometry);
    this.engine.dispatchFeature({ type: 'UPDATE_FEATURE', payload: { id, updates: { geojson } } });
    this.engine.mapActions?.updateFeatureGeometry(id, geojson);
  };

  updateLineStringCoords = (id: string, coords: LngLat[]): void => {
    const feature = this.engine.getSnapshot().features.features.find((f: DataFeature) => f.id === id);
    if (!feature || feature.geometryKind !== 'linestring') return;
    const geojson = this.replaceGeometry(feature, lineStringToGeoJSONFeature(coords).geometry);
    this.engine.dispatchFeature({ type: 'UPDATE_FEATURE', payload: { id, updates: { geojson } } });
    this.engine.mapActions?.updateFeatureGeometry(id, geojson);
  };

  updatePolygonRing = (id: string, ring: LngLat[]): void => {
    const feature = this.engine.getSnapshot().features.features.find((f: DataFeature) => f.id === id);
    if (!feature || feature.geometryKind !== 'polygon') return;
    const geojson = this.replaceGeometry(feature, polygonRingToGeoJSONFeature(ring).geometry);
    this.engine.dispatchFeature({ type: 'UPDATE_FEATURE', payload: { id, updates: { geojson } } });
    this.engine.mapActions?.updateFeatureGeometry(id, geojson);
  };

  private replaceGeometry(feature: any, geometry: GeoJSON.Geometry): GeoJSON.Feature {
    return { ...feature.geojson, geometry };
  }

  featuresByCategory(features: ReadonlyArray<DataFeature>, category: string): DataFeature[] {
    return features.filter((f) => f.category === category);
  }
}
