import type { SimulationEngine } from './engine';
import type { DrawMode, DrawnFeature, GeometryKind, CircleGeometry } from './types';
import { 
  circleToPolygon, 
  lineStringToGeoJSONFeature, 
  polygonRingToGeoJSONFeature, 
  COORDINATE_PRECISION, 
  type LngLat 
} from './spatial';

export interface DrawState {
  features: DrawnFeature[];
  selectedFeatureId: string | null;
  drawMode: DrawMode;
  /**
   * Category to seed onto the next drawn feature (set by the active tool's
   * label, so two tools sharing a mode — "Roost" vs "Light Source" — produce
   * features with different categories). Cleared whenever `select` is active.
   */
  pendingCategory: string | null;
}

export type DrawAction =
  | { type: 'ADD_FEATURE'; payload: DrawnFeature }
  | { type: 'REMOVE_FEATURE'; payload: string }
  | { type: 'UPDATE_FEATURE'; payload: { id: string; updates: Partial<DrawnFeature> } }
  | { type: 'SELECT_FEATURE'; payload: string | null }
  | { type: 'START_DRAWING'; payload: { mode: DrawMode; category: string } }
  | { type: 'SET_DRAW_MODE'; payload: DrawMode }
  | { type: 'CLEAR_ALL' };

export class EngineDrawingController {
  constructor(private engine: SimulationEngine) {}

  /* ------------------------------------------------------------------------ */
  /* Reducer Context & Initializers                                           */
  /* ------------------------------------------------------------------------ */

  getInitialState(): DrawState {
    return {
      features: [],
      selectedFeatureId: null,
      drawMode: 'select',
      pendingCategory: null,
    };
  }

  reducer(state: DrawState, action: DrawAction): DrawState {
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
      case 'START_DRAWING':
        return {
          ...state,
          drawMode: action.payload.mode,
          pendingCategory: action.payload.category,
        };
      case 'SET_DRAW_MODE':
        // Switching the mode (incl. back to `select` after a finish) clears the
        // pending category — a new draw must come from a fresh tool click.
        return { ...state, drawMode: action.payload, pendingCategory: null };
      case 'CLEAR_ALL':
        return this.getInitialState();
      default:
        return state;
    }
  }

  /* ------------------------------------------------------------------------ */
  /* Imperative Orchestrations                                                */
  /* ------------------------------------------------------------------------ */

  startDrawing = (mode: DrawMode, category: string = ''): void => {
    this.engine.dispatchDraw({ type: 'START_DRAWING', payload: { mode, category } });
  };

  selectMode = (): void => {
    this.engine.dispatchDraw({ type: 'SET_DRAW_MODE', payload: 'select' });
  };

  removeFeature = (id: string): void => {
    this.engine.dispatchDraw({ type: 'REMOVE_FEATURE', payload: id });
    this.engine.mapActions?.removeFeatureFromMap(id);
  };

  toggleVisibility = (id: string): void => {
    const feature = this.engine.getSnapshot().draw.features.find((f: DrawnFeature) => f.id === id);
    if (!feature) return;
    const visible = !feature.visible;
    this.engine.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { visible } } });
    this.engine.mapActions?.setFeatureVisibility(id, visible, feature.geojson);
  };

  updateCircle = (id: string, patch: Partial<CircleGeometry>): void => {
    const feature = this.engine.getSnapshot().draw.features.find((f: DrawnFeature) => f.id === id);
    if (!feature || !feature.circle) return;
    const circle = { ...feature.circle, ...patch };
    const geojson = this.replaceGeometry(feature, circleToPolygon(circle.center, circle.radiusMeters).geometry);
    this.engine.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { circle, geojson } } });
    this.engine.mapActions?.updateFeatureGeometry(id, geojson);
  };

  updatePointPosition = (id: string, lngLat: LngLat): void => {
    const feature = this.engine.getSnapshot().draw.features.find((f: DrawnFeature) => f.id === id);
    if (!feature || feature.geometryKind !== 'point') return;
    const fRatio = 10 ** COORDINATE_PRECISION;
    const lng = Math.round(lngLat.lng * fRatio) / fRatio;
    const lat = Math.round(lngLat.lat * fRatio) / fRatio;
    const geometry: GeoJSON.Geometry = { type: 'Point', coordinates: [lng, lat] };
    const geojson = this.replaceGeometry(feature, geometry);
    this.engine.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { geojson } } });
    this.engine.mapActions?.updateFeatureGeometry(id, geojson);
  };

  updateLineStringCoords = (id: string, coords: LngLat[]): void => {
    const feature = this.engine.getSnapshot().draw.features.find((f: DrawnFeature) => f.id === id);
    if (!feature || feature.geometryKind !== 'linestring') return;
    const geojson = this.replaceGeometry(feature, lineStringToGeoJSONFeature(coords).geometry);
    this.engine.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { geojson } } });
    this.engine.mapActions?.updateFeatureGeometry(id, geojson);
  };

  updatePolygonRing = (id: string, ring: LngLat[]): void => {
    const feature = this.engine.getSnapshot().draw.features.find((f: DrawnFeature) => f.id === id);
    if (!feature || feature.geometryKind !== 'polygon') return;
    const geojson = this.replaceGeometry(feature, polygonRingToGeoJSONFeature(ring).geometry);
    this.engine.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { geojson } } });
    this.engine.mapActions?.updateFeatureGeometry(id, geojson);
  };

  private replaceGeometry(feature: any, geometry: GeoJSON.Geometry): GeoJSON.Feature {
    return { ...feature.geojson, geometry };
  }

  /* ------------------------------------------------------------------------ */
  /* Static Projection / Helper Operations                                    */
  /* ------------------------------------------------------------------------ */

  /** Map a logical draw mode to a geometry kind. `select` defaults to `point`. */
  geometryKindForMode(mode: DrawMode): GeometryKind {
    switch (mode) {
      case 'point': return 'point';
      case 'linestring': return 'linestring';
      case 'polygon': return 'polygon';
      case 'circle': return 'circle';
      default: return 'point';
    }
  }

  /**
   * Filter drawn features by category — enables "retrieve all roosts" /
   * "retrieve all light sources" queries after labelled-drawing.
   */
  featuresByCategory(features: ReadonlyArray<DrawnFeature>, category: string): DrawnFeature[] {
    return features.filter((f) => f.category === category);
  }
}