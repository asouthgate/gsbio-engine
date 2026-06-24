import type { SimulationEngine } from './engine';
import type { DrawMode, CircleGeometry } from './types';
import { 
  circleToPolygon, 
  lineStringToGeoJSONFeature, 
  polygonRingToGeoJSONFeature, 
  COORDINATE_PRECISION, 
  type LngLat 
} from './spatial';

export class EngineDrawingActions {
  constructor(private engine: SimulationEngine) {}

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
    const feature = this.engine.getSnapshot().draw.features.find((f) => f.id === id);
    if (!feature) return;
    const visible = !feature.visible;
    this.engine.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { visible } } });
    this.engine.mapActions?.setFeatureVisibility(id, visible, feature.geojson);
  };

  updateCircle = (id: string, patch: Partial<CircleGeometry>): void => {
    const feature = this.engine.getSnapshot().draw.features.find((f) => f.id === id);
    if (!feature || !feature.circle) return;
    const circle = { ...feature.circle, ...patch };
    const geojson = this.replaceGeometry(feature, circleToPolygon(circle.center, circle.radiusMeters).geometry);
    this.engine.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { circle, geojson } } });
    this.engine.mapActions?.updateFeatureGeometry(id, geojson);
  };

  updatePointPosition = (id: string, lngLat: LngLat): void => {
    const feature = this.engine.getSnapshot().draw.features.find((f) => f.id === id);
    if (!feature || feature.geometryKind !== 'point') return;
    const f = 10 ** COORDINATE_PRECISION;
    const lng = Math.round(lngLat.lng * f) / f;
    const lat = Math.round(lngLat.lat * f) / f;
    const geometry: GeoJSON.Geometry = { type: 'Point', coordinates: [lng, lat] };
    const geojson = this.replaceGeometry(feature, geometry);
    this.engine.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { geojson } } });
    this.engine.mapActions?.updateFeatureGeometry(id, geojson);
  };

  updateLineStringCoords = (id: string, coords: LngLat[]): void => {
    const feature = this.engine.getSnapshot().draw.features.find((f) => f.id === id);
    if (!feature || feature.geometryKind !== 'linestring') return;
    const geojson = this.replaceGeometry(feature, lineStringToGeoJSONFeature(coords).geometry);
    this.engine.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { geojson } } });
    this.engine.mapActions?.updateFeatureGeometry(id, geojson);
  };

  updatePolygonRing = (id: string, ring: LngLat[]): void => {
    const feature = this.engine.getSnapshot().draw.features.find((f) => f.id === id);
    if (!feature || feature.geometryKind !== 'polygon') return;
    const geojson = this.replaceGeometry(feature, polygonRingToGeoJSONFeature(ring).geometry);
    this.engine.dispatchDraw({ type: 'UPDATE_FEATURE', payload: { id, updates: { geojson } } });
    this.engine.mapActions?.updateFeatureGeometry(id, geojson);
  };

  private replaceGeometry(feature: any, geometry: GeoJSON.Geometry): GeoJSON.Feature {
    return { ...feature.geojson, geometry };
  }
}