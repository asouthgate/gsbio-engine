import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import {
  TerraDraw,
  TerraDrawSelectMode,
  TerraDrawPointMode,
  TerraDrawLineStringMode,
  TerraDrawPolygonMode,
  TerraDrawCircleMode,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import {
  averageRadiusMeters,
  centroid,
  geometryKindForMode,
  type DrawMode,
  type LngLat,
  type Renderer,
  type SimulationEngine,
} from '@catshark/core';

export interface TerraDraw2DOptions {
  /** MapLibre style spec (sources + layers). */
  style: maplibregl.StyleSpecification;
  /** Initial map center [lng, lat]. */
  center?: [number, number];
  /** Initial zoom level. */
  zoom?: number;
}

interface TerraDrawLike {
  start(): void;
  stop(): void;
  setMode(mode: string): void;
  removeFeatures(ids: (string | number)[]): void;
  addFeatures(features: never[]): void;
  getSnapshotFeature(id: string | number): unknown;
  on(event: 'finish', cb: (id: string | number) => void): void;
  on(event: 'change', cb: (ids: (string | number)[]) => void): void;
}

/**
 * 2D renderer plugin backed by MapLibre + TerraDraw.
 *
 * `@catshark/react`'s `Canvas` host instantiates this via the demo app and
 * passes an `engine` (a `SimulationEngine`) to `mount`. The renderer wires
 * its TerraDraw lifecycle against the engine's headless state tree: incoming
 * draw/finish/change events dispatch into the engine; engine draw-mode changes
 * are reflected back into TerraDraw via a subscription.
 */
export class TerraDraw2DRenderer implements Renderer {
  private map: maplibregl.Map | null = null;
  private draw: TerraDrawLike | null = null;
  private disposed = false;
  private unsubscribeEngine: (() => void) | null = null;
  /** Composite `${runId}__${layerId}` → maplibre layer ids (for teardown on
   *  `removeResultLayer(runId, layerId)`). One entry per addressable result
   *  layer; a run with N image layers owns N disjoint sources+layers. */
  private readonly resultLayers = new Map<string, string[]>();

  /** Stable maplibre source id for a single result layer. */
  private sourceId(runId: string, layerId: string): string {
    return `catshark-result-${runId}__${layerId}`;
  }
  private layerKey(runId: string, layerId: string): string {
    return `${runId}__${layerId}`;
  }

  constructor(private readonly options: TerraDraw2DOptions) {}

  async mount(container: HTMLElement, engineInstance: unknown): Promise<void> {
    const engine = engineInstance as SimulationEngine;
    // mount() is re-entrant: a prior mount (e.g. React 19 StrictMode dev
    // double-invoke) may have left a live map on this instance. Tear it down
    // synchronously before starting a fresh one so there is never more than
    // one maplibre map / TerraDraw on the container.
    this.unmount();
    this.disposed = false;
    const map = new maplibregl.Map({
      container,
      style: this.options.style,
      center: this.options.center ?? [0, 0],
      zoom: this.options.zoom ?? 2,
    });
    this.map = map;

    await new Promise<void>((resolve) => {
      map.on('load', () => resolve());
    });

    // If a cleanup / second mount superseded this one while we were awaiting
    // 'load', abort: this.map would now belong to the newer mount (or be
    // null). Remove this orphan map but leave the current one alone.
    if (this.map !== map || this.disposed) {
      map.remove();
      if (this.map === map) this.map = null;
      return;
    }

    const adapter = new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: 9 });
    const draw = new TerraDraw({
      adapter,
      modes: [
        new TerraDrawSelectMode({
          flags: {
            point: { feature: { draggable: true } },
            linestring: {
              feature: { draggable: true, coordinates: { draggable: true, midpoints: { draggable: true } } },
            },
            polygon: {
              feature: { draggable: true, coordinates: { draggable: true, midpoints: { draggable: true } } },
            },
            // Circles: draggable (translate centre) + scaleable (resize radius
            // via Ctrl+S modifier), but NO coordinate-level dragging — the
            // boundary polygon approximation is fixed.
            circle: { feature: { draggable: true, scaleable: true } },
          },
        }) as never,
        new TerraDrawPointMode() as never,
        new TerraDrawLineStringMode() as never,
        new TerraDrawPolygonMode() as never,
        new TerraDrawCircleMode() as never,
      ],
    }) as unknown as TerraDrawLike;

    draw.start();
    this.draw = draw;

    // Bridge imperative map actions from the engine to TerraDraw.
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
      // Result layer port: render a `MapLayerEnvelope` (GeoJSON / tiles /
      // image) under a stable per-(runId, layerId) source id. A run that
      // yields N image envelopes hence owns N disjoint sources and layers;
      // `removeResultLayer(runId, layerId)` tears down exactly one. Re-adding
      // the same pair removes first (replace semantics).
      addResultLayer: (runId, layerId, envelope) => {
        const m = this.map;
        if (!m) return;
        const srcId = this.sourceId(runId, layerId);
        const key = this.layerKey(runId, layerId);
        // Re-entrancy-safe teardown for this specific pair only (e.g. user
        // toggles show → hide → show). Sibling layers under the same run are
        // untouched.
        try {
          const prev = this.resultLayers.get(key) ?? [];
          for (const lid of prev) {
            try { m.removeLayer(lid); } catch { /* not added yet */ }
          }
          m.removeSource(srcId);
        } catch { /* ignore */ }
        const layerIds: string[] = [];
        if (envelope.kind === 'geojson') {
          m.addSource(srcId, { type: 'geojson', data: envelope.data as never });
          layerIds.push(`${srcId}-fill`, `${srcId}-line`, `${srcId}-circle`);
          m.addLayer({
            id: `${srcId}-fill`,
            type: 'fill',
            source: srcId,
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: { 'fill-color': '#ff8800', 'fill-opacity': 0.25 },
          });
          m.addLayer({
            id: `${srcId}-line`,
            type: 'line',
            source: srcId,
            filter: ['==', ['geometry-type'], 'LineString'],
            paint: { 'line-color': '#ff8800', 'line-width': 2 },
          });
          m.addLayer({
            id: `${srcId}-circle`,
            type: 'circle',
            source: srcId,
            filter: ['==', ['geometry-type'], 'Point'],
            paint: { 'circle-radius': 5, 'circle-color': '#ff8800' },
          });
        } else if (envelope.kind === 'image') {
          m.addSource(srcId, {
            type: 'image',
            url: envelope.url,
            coordinates: [
              [envelope.bounds[0], envelope.bounds[3]],
              [envelope.bounds[2], envelope.bounds[3]],
              [envelope.bounds[2], envelope.bounds[1]],
              [envelope.bounds[0], envelope.bounds[1]],
            ] as never,
          });
          layerIds.push(`${srcId}-raster`);
          m.addLayer({ id: `${srcId}-raster`, type: 'raster', source: srcId });
        } else {
          m.addSource(srcId, {
            type: envelope.type,
            tiles: [envelope.url],
            tileSize: 256,
          } as never);
          if (envelope.type === 'raster') {
            layerIds.push(`${srcId}-raster`);
            m.addLayer({ id: `${srcId}-raster`, type: 'raster', source: srcId });
          } else {
            const sourceLayer = envelope.sourceLayer;
            layerIds.push(`${srcId}-line`, `${srcId}-fill`);
            m.addLayer({
              id: `${srcId}-line`,
              type: 'line',
              source: srcId,
              'source-layer': sourceLayer,
              paint: { 'line-color': '#ff8800', 'line-width': 2 },
            });
            m.addLayer({
              id: `${srcId}-fill`,
              type: 'fill',
              source: srcId,
              'source-layer': sourceLayer,
              paint: { 'fill-color': '#ff8800', 'fill-opacity': 0.25 },
            });
          }
        }
        this.resultLayers.set(key, layerIds);
      },
      removeResultLayer: (runId: string, layerId: string) => {
        const m = this.map;
        if (!m) return;
        const key = this.layerKey(runId, layerId);
        const layerIds = this.resultLayers.get(key);
        if (layerIds) {
          for (const id of layerIds) {
            try { m.removeLayer(id); } catch { /* ignore */ }
          }
        }
        try { m.removeSource(this.sourceId(runId, layerId)); } catch { /* ignore */ }
        this.resultLayers.delete(key);
      },
    });

    // Reflect engine draw-mode changes into TerraDraw.
    const applyMode = (mode: DrawMode) => {
      try { draw.setMode(mode); } catch { /* mode may not be ready */ }
    };
    let lastMode: DrawMode | null = engine.getSnapshot().draw.drawMode;
    applyMode(lastMode === 'select' ? 'select' : lastMode);
    this.unsubscribeEngine = engine.subscribe(() => {
      const mode = engine.getSnapshot().draw.drawMode;
      if (mode !== lastMode) {
        lastMode = mode;
        applyMode(mode === 'select' ? 'select' : mode);
      }
    });

    // Incoming TerraDraw events → engine state.
    draw.on('finish', (id) => {
      const feature = draw.getSnapshotFeature(id);
      if (!feature) return;
      const typeId = String(id);
      const geojson = feature as unknown as GeoJSON.Feature;
      const snapshot = engine.getSnapshot().draw;
      const existing = snapshot.features.find((f) => f.id === typeId);
      if (existing) {
        if (existing.geometryKind === 'circle' && existing.circle) {
          // Existing circle edited on the map (translated/scaled). Recover the
          // semantic centre + radius from the live polygon approximation and
          // regenerate the canonical circle via `updateCircle` — the dragged
          // polygon is replaced on the map with a fresh 64-segment one.
          const geom = geojson.geometry as { type: string; coordinates: number[][][] };
          if (geom.type === 'Polygon' && Array.isArray(geom.coordinates[0])) {
            const ring: LngLat[] = geom.coordinates[0].map(([lng, lat]) => ({ lng, lat }));
            const newCenter = centroid(ring);
            const newRadius = averageRadiusMeters(newCenter, ring);
            engine.updateCircle(typeId, { center: newCenter, radiusMeters: newRadius });
          } else {
            engine.dispatchDraw({
              type: 'UPDATE_FEATURE',
              payload: { id: typeId, updates: { geojson } },
            });
          }
        } else {
          engine.dispatchDraw({
            type: 'UPDATE_FEATURE',
            payload: { id: typeId, updates: { geojson } },
          });
        }
      } else {
        // New feature. For circles, TerraDraw only writes `radiusKilometers`
        // to properties — the centre lives on the mode instance, never on
        // the snapshot. Recover it geometrically: centroid of the polygon
        // approximation is the circle's centre.
        let circle: { center: LngLat; radiusMeters: number } | undefined;
        if (snapshot.drawMode === 'circle') {
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
        engine.dispatchDraw({
          type: 'ADD_FEATURE',
          payload: {
            id: typeId,
            geometryKind: geometryKindForMode(snapshot.drawMode),
            category: snapshot.pendingCategory ?? '',
            label: '',
            visible: true,
            geojson,
            ...(circle ? { circle } : {}),
          },
        });
      }
      engine.dispatchDraw({ type: 'SET_DRAW_MODE', payload: 'select' });
    });

    draw.on('change', (ids) => {
      const id = ids[0];
      if (!id) return;
      const feature = draw.getSnapshotFeature(id);
      if (!feature) return;
      const typeId = String(id);
      const existing = engine.getSnapshot().draw.features.find((f) => f.id === typeId);
      if (!existing) return;
      // Circles are defined by (center, radius) — their polygon approximation
      // is fixed, so drag-driven polygon edits are ignored. The TerraDraw
      // select-mode flags map has no 'circle' key, so drags can't start on a
      // circle anyway — this is defensive against future flag changes.
      if (existing.geometryKind === 'circle') return;
      engine.dispatchDraw({
        type: 'UPDATE_FEATURE',
        payload: { id: typeId, updates: { geojson: feature as unknown as GeoJSON.Feature } },
      });
    });
  }

  unmount(): void {
    this.disposed = true;
    this.unsubscribeEngine?.();
    this.unsubscribeEngine = null;
    try { this.draw?.stop(); } catch { /* ignore */ }
    this.draw = null;
    try { this.map?.remove(); } catch { /* ignore */ }
    this.map = null;
  }
}

export function createTerraDraw2DRenderer(options: TerraDraw2DOptions): TerraDraw2DRenderer {
  return new TerraDraw2DRenderer(options);
}