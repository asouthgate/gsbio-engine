import {
  averageRadiusMeters,
  centroid,
  type DataFeature,
  type LngLat,
  type SimulationEngine,
} from '../core';
import type { DrawMode, TerraDrawLike } from './types';
import { compositeModeName } from './styles';
import type { MapManager } from './mapManager';

export interface DrawControl {
  startDrawing: (mode: DrawMode, category?: string) => void;
  selectMode: () => void;
}

export function wireEvents(
  engine: SimulationEngine,
  draw: TerraDrawLike,
  mapManager: MapManager,
  compositeModes: Map<string, { drawMode: DrawMode; category: string; style: unknown }>,
  geometryKindForMode: (mode: DrawMode) => DataFeature['geometryKind'],
): DrawControl & { cleanup: () => void } {
  let lastMode: DrawMode | null = null;
  let lastCategory: string | null = null;

  const resolveModeName = (mode: DrawMode, category: string): string => {
    if (mode === 'select') return 'select';
    const composite = category ? compositeModeName(mode, category) : '';
    return compositeModes.has(composite) ? composite : mode;
  };

  const applyMode = (mode: DrawMode, category: string) => {
    try { draw.setMode(resolveModeName(mode, category)); } catch { /* mode may not be ready */ }
  };

  const applyCurrentMode = () => {
    applyMode(
      lastMode === 'select' || lastMode === null ? 'select' : lastMode,
      lastCategory ?? '',
    );
  };

  engine.setMapActions({
    removeFeatureFromMap: (id: string) => {
      try { draw.removeFeatures([id]); } catch { /* feature may not exist */ }
    },
    setFeatureVisibility: (id: string, visible: boolean, geojson: GeoJSON.Feature) => {
      try {
        if (!visible) {
          draw.removeFeatures([id]);
        } else {
          draw.addFeatures([geojson as never]);
        }
      } catch { /* ignore */ }
    },
    updateFeatureGeometry: (id: string, geojson: GeoJSON.Feature) => {
      try {
        draw.removeFeatures([id]);
        draw.addFeatures([geojson as never]);
      } catch { /* ignore */ }
    },
    addResultLayer: (rid, lid, env) => mapManager.addResultLayer(rid, lid, env),
    removeResultLayer: (rid, lid) => mapManager.removeResultLayer(rid, lid),
  });

  draw.on('finish', (id) => {
    const feature = draw.getSnapshotFeature(id);
    if (!feature) return;
    const typeId = String(id);
    const geojson = feature as unknown as GeoJSON.Feature;
    const snapshot = engine.getSnapshot().features;
    const existing = snapshot.features.find((f: DataFeature) => f.id === typeId);
    if (existing) {
      if (existing.geometryKind === 'circle' && existing.circle) {
        const geom = geojson.geometry as { type: string; coordinates: number[][][] };
        if (geom.type === 'Polygon' && Array.isArray(geom.coordinates[0])) {
          const ring: LngLat[] = geom.coordinates[0].map(([lng, lat]) => ({ lng, lat }));
          const newCenter = centroid(ring);
          const newRadius = averageRadiusMeters(newCenter, ring);
          engine.features.updateCircle(typeId, { center: newCenter, radiusMeters: newRadius });
        } else {
          engine.dispatchFeature({
            type: 'UPDATE_FEATURE',
            payload: { id: typeId, updates: { geojson } },
          });
        }
      } else {
        engine.dispatchFeature({
          type: 'UPDATE_FEATURE',
          payload: { id: typeId, updates: { geojson } },
        });
      }
    } else {
      let circle: { center: LngLat; radiusMeters: number } | undefined;
      if (lastMode === 'circle') {
        const props = (geojson as { properties?: Record<string, unknown> }).properties ?? {};
        const geom = geojson.geometry as { type: string; coordinates: number[][][] };
        if (geom.type === 'Polygon' && Array.isArray(geom.coordinates[0]) && typeof props.radiusKilometers === 'number') {
          const ring: LngLat[] = geom.coordinates[0].map(([lng, lat]) => ({ lng, lat }));
          circle = {
            center: centroid(ring),
            radiusMeters: Number(props.radiusKilometers) * 1000,
          };
        }
      }
      engine.dispatchFeature({
        type: 'ADD_FEATURE',
        payload: {
          id: typeId,
          geometryKind: geometryKindForMode(lastMode ?? 'point'),
          category: lastCategory ?? '',
          label: '',
          visible: true,
          geojson,
          ...(circle ? { circle } : {}),
        },
      });
    }
    if (lastMode !== 'select') {
      lastMode = 'select';
      lastCategory = null;
      applyCurrentMode();
    }
  });

  draw.on('change', (ids) => {
    const id = ids[0];
    if (!id) return;
    const feature = draw.getSnapshotFeature(id);
    if (!feature) return;
    const typeId = String(id);
    const existing = engine.getSnapshot().features.features.find((f: DataFeature) => f.id === typeId);
    if (!existing) return;
    if (existing.geometryKind === 'circle') return;
    engine.dispatchFeature({
      type: 'UPDATE_FEATURE',
      payload: { id: typeId, updates: { geojson: feature as unknown as GeoJSON.Feature } },
    });
  });

  const startDrawing = (mode: DrawMode, category: string = '') => {
    lastMode = mode;
    lastCategory = category;
    applyCurrentMode();
  };

  const selectMode = () => {
    lastMode = 'select';
    lastCategory = null;
    applyCurrentMode();
  };

  applyCurrentMode();

  return {
    startDrawing,
    selectMode,
    cleanup: () => {},
  };
}
