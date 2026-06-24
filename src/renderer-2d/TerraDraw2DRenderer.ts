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
} from '../core';

/** Composite terra-draw mode name for a (drawMode, category) tool. */
function compositeModeName(drawMode: DrawMode, category: string): string {
  return `${drawMode}__${category}`;
}

/** Shallow merge of a base paint with an override (override wins). */
function mergePaint(base: ShapePaint, override: ShapePaint | undefined): ShapePaint {
  return override ? { ...base, ...override } : { ...base };
}

/** Map a `ShapePaint` to terra-draw point-mode `styles` keys. */
function toPointStyles(p: ShapePaint): Record<string, unknown> {
  const s: Record<string, unknown> = {};
  const color = p.pointColor ?? p.fillColor;
  if (color) s.pointColor = color;
  if (p.pointRadius != null) s.pointWidth = p.pointRadius;
  const outline = p.pointOutlineColor ?? p.outlineColor;
  if (outline) s.pointOutlineColor = outline;
  return s;
}

/** Map a `ShapePaint` to terra-draw linestring-mode `styles` keys. */
function toLineStringStyles(p: ShapePaint): Record<string, unknown> {
  const s: Record<string, unknown> = {};
  const color = p.lineColor ?? p.outlineColor;
  if (color) s.lineStringColor = color;
  const width = p.lineWidth ?? p.outlineWidth;
  if (width != null) s.lineStringWidth = width;
  return s;
}

/** Map a `ShapePaint` to terra-draw polygon/circle-mode `styles` keys. */
function toPolygonStyles(p: ShapePaint): Record<string, unknown> {
  const s: Record<string, unknown> = {};
  if (p.fillColor) s.fillColor = p.fillColor;
  if (p.fillOpacity != null) s.fillOpacity = p.fillOpacity;
  if (p.outlineColor) s.outlineColor = p.outlineColor;
  if (p.outlineWidth != null) s.outlineWidth = p.outlineWidth;
  return s;
}

/**
 * Renderer-local paint description for a drawn feature. Translate-free of any
 * maplibre/terra-draw specifics so apps can declare styles without importing
 * those packages. Rendered as a deep merge over `DEFAULT_FEATURE_STYLES`.
 */
export interface ShapePaint {
  fillColor?: string;
  fillOpacity?: number;
  outlineColor?: string;
  outlineWidth?: number;
  /** Point fill. Aliases `fillColor` when omitted for points. */
  pointColor?: string;
  pointOutlineColor?: string;
  pointRadius?: number;
  /** Linestring outline. Aliases `outlineColor` for lines. */
  lineColor?: string;
  lineWidth?: number;
}

/** A tool whose category gets a distinct on-map style. */
export interface FeatureToolStyle {
  mode: DrawMode;
  /** The `category` value the engine stamps onto features drawn with the tool. */
  category: string;
  style: ShapePaint;
}

export interface FeatureStyleConfig {
  /** Per geometry-kind base styles (deep-merged over renderer defaults). */
  point?: ShapePaint;
  linestring?: ShapePaint;
  polygon?: ShapePaint;
  circle?: ShapePaint;
  /** Optional per-category tool styles → composite terra-draw modes. */
  tools?: FeatureToolStyle[];
}

/** Paint for result (model-output) layers. App overrides the renderer defaults. */
export interface ResultPaint {
  fillColor?: string;
  fillOpacity?: number;
  lineColor?: string;
  lineWidth?: number;
  circleColor?: string;
  circleRadius?: number;
}

export interface TerraDraw2DOptions {
  /** MapLibre style spec (sources + layers). */
  style: maplibregl.StyleSpecification;
  /** Initial map center [lng, lat]. */
  center?: [number, number];
  /** Initial zoom level. */
  zoom?: number;
  /**
   * Drawn-feature paint config. Deep-merged over `DEFAULT_FEATURE_STYLES`,
   * the engine-provided base. Apps override per-kind defaults and/or declare
   * per-category `tools` for distinct on-map styles.
   */
  featureStyles?: FeatureStyleConfig;
  /**
   * Result (model-output) layer paint. Deep-merged over
   * `DEFAULT_RESULT_PAINT`.
   */
  resultStyles?: ResultPaint;
}

/**
 * Base drawn-feature palette — teal, matching the shipped app CSS. Apps
 * override via `TerraDraw2DOptions.featureStyles`. All paint the engine ships
 * lives here; `../core` stays headless.
 */
export const DEFAULT_FEATURE_STYLES: Record<DrawMode, ShapePaint> = {
  select: {},
  point: {
    pointColor: '#2dd4bf',
    pointOutlineColor: '#0a0e10',
    pointRadius: 6,
  },
  linestring: {
    lineColor: '#2dd4bf',
    lineWidth: 2,
  },
  polygon: {
    fillColor: '#2dd4bf',
    fillOpacity: 0.18,
    outlineColor: '#5eead4',
    outlineWidth: 2,
  },
  circle: {
    fillColor: '#2dd4bf',
    fillOpacity: 0.12,
    outlineColor: '#5eead4',
    outlineWidth: 2,
  },
};

/**
 * Base result-layer palette — Okabe-Ito amber `#E69F00`, colourblind-safe and
 * maximally distinct from the teal drawn-feature palette.
 */
export const DEFAULT_RESULT_PAINT: Required<ResultPaint> = {
  fillColor: '#E69F00',
  fillOpacity: 0.25,
  lineColor: '#E69F00',
  lineWidth: 2,
  circleColor: '#E69F00',
  circleRadius: 5,
};

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
 * `../react`'s `Canvas` host instantiates this via the demo app and
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

  /** Resolved per-kind drawn-feature paints (app override merged over base). */
  private readonly featurePaints: Record<DrawMode, ShapePaint>;
  /** Composite modes registered for declared `tools`, keyed by mode name. */
  private readonly compositeModes = new Map<string, { drawMode: DrawMode; category: string; style: ShapePaint }>();
  /** Resolved result-layer paint (app override merged over base). */
  private readonly resultPaint: Required<ResultPaint>;

  /** Stable maplibre source id for a single result layer. */
  private sourceId(runId: string, layerId: string): string {
    return `gsbio-result-${runId}__${layerId}`;
  }
  private layerKey(runId: string, layerId: string): string {
    return `${runId}__${layerId}`;
  }

  constructor(private readonly options: TerraDraw2DOptions) {
    const fs = options.featureStyles ?? {};
    this.featurePaints = {
      select: {},
      point: mergePaint(DEFAULT_FEATURE_STYLES.point, fs.point),
      linestring: mergePaint(DEFAULT_FEATURE_STYLES.linestring, fs.linestring),
      polygon: mergePaint(DEFAULT_FEATURE_STYLES.polygon, fs.polygon),
      circle: mergePaint(DEFAULT_FEATURE_STYLES.circle, fs.circle),
    };
    this.resultPaint = { ...DEFAULT_RESULT_PAINT, ...options.resultStyles };
    // Composite per-(mode, category) modes for declared tools. Each gets its
    // own terra-draw mode instance keyed by `${mode}__${category}`; the engine
    // subscription routes `setMode` here when `pendingCategory` is set.
    for (const t of fs.tools ?? []) {
      if (t.mode === 'select') continue;
      const name = compositeModeName(t.mode, t.category);
      this.compositeModes.set(name, { drawMode: t.mode, category: t.category, style: t.style });
    }
  }

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
    // Base draw modes carry the resolved per-kind styles. Composite
    // per-category modes (one terra-draw instance each, keyed by
    // `${mode}__${category}`) carry the per-tool style merged over the base.
    const makeComposite = (drawMode: DrawMode, name: string): never => {
      const entry = this.compositeModes.get(name);
      const paint = mergePaint(this.featurePaints[drawMode], entry?.style);
      switch (drawMode) {
        case 'point':
          return new TerraDrawPointMode({ modeName: name, styles: toPointStyles(paint) }) as never;
        case 'linestring':
          return new TerraDrawLineStringMode({ modeName: name, styles: toLineStringStyles(paint) }) as never;
        case 'polygon':
          return new TerraDrawPolygonMode({ modeName: name, styles: toPolygonStyles(paint) }) as never;
        case 'circle':
          return new TerraDrawCircleMode({ modeName: name, styles: toPolygonStyles(paint) }) as never;
        default:
          throw new Error(`Cannot create composite mode for ${drawMode}`);
      }
    };
    const compositeModeInstances = Array.from(this.compositeModes.keys()).map(
      (name) => makeComposite(this.compositeModes.get(name)!.drawMode, name),
    );
    const draw = new TerraDraw({
      adapter,
      modes: [
        (() => {
          const flags: Record<string, unknown> = {
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
          };
          // Composite modes inherit their base draw-mode's select flags so
          // they are editable on the map (e.g. circle__Spread_zone mirrors
          // the circle flags).
          for (const [name, cm] of this.compositeModes) {
            flags[name] = flags[cm.drawMode];
          }
          return new TerraDrawSelectMode({ flags } as never) as never;
        })(),
        new TerraDrawPointMode({ styles: toPointStyles(this.featurePaints.point) }) as never,
        new TerraDrawLineStringMode({ styles: toLineStringStyles(this.featurePaints.linestring) }) as never,
        new TerraDrawPolygonMode({ styles: toPolygonStyles(this.featurePaints.polygon) }) as never,
        new TerraDrawCircleMode({ styles: toPolygonStyles(this.featurePaints.circle) }) as never,
        ...compositeModeInstances,
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
        const rp = this.resultPaint;
        if (envelope.kind === 'geojson') {
          m.addSource(srcId, { type: 'geojson', data: envelope.data as never });
          layerIds.push(`${srcId}-fill`, `${srcId}-line`, `${srcId}-circle`);
          m.addLayer({
            id: `${srcId}-fill`,
            type: 'fill',
            source: srcId,
            filter: ['==', ['geometry-type'], 'Polygon'],
            paint: { 'fill-color': rp.fillColor, 'fill-opacity': rp.fillOpacity },
          });
          m.addLayer({
            id: `${srcId}-line`,
            type: 'line',
            source: srcId,
            filter: ['==', ['geometry-type'], 'LineString'],
            paint: { 'line-color': rp.lineColor, 'line-width': rp.lineWidth },
          });
          m.addLayer({
            id: `${srcId}-circle`,
            type: 'circle',
            source: srcId,
            filter: ['==', ['geometry-type'], 'Point'],
            paint: { 'circle-radius': rp.circleRadius, 'circle-color': rp.circleColor },
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
            const rp = this.resultPaint;
            layerIds.push(`${srcId}-line`, `${srcId}-fill`);
            m.addLayer({
              id: `${srcId}-line`,
              type: 'line',
              source: srcId,
              'source-layer': sourceLayer,
              paint: { 'line-color': rp.lineColor, 'line-width': rp.lineWidth },
            });
            m.addLayer({
              id: `${srcId}-fill`,
              type: 'fill',
              source: srcId,
              'source-layer': sourceLayer,
              paint: { 'fill-color': rp.fillColor, 'fill-opacity': rp.fillOpacity },
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

    // Reflect engine draw-mode (+ pending category) changes into TerraDraw.
    // When a per-category composite mode is registered for the current
    // (drawMode, pendingCategory) pair we route to it so the tool's own style
    // paints the in-progress shape; otherwise the base mode is used.
    const resolveModeName = (mode: DrawMode, category: string): string => {
      if (mode === 'select') return 'select';
      const composite = category ? compositeModeName(mode, category) : '';
      return this.compositeModes.has(composite) ? composite : mode;
    };
    const applyMode = (mode: DrawMode, category: string) => {
      try { draw.setMode(resolveModeName(mode, category)); } catch { /* mode may not be ready */ }
    };
    let lastMode: DrawMode | null = engine.getSnapshot().draw.drawMode;
    let lastCategory: string | null = engine.getSnapshot().draw.pendingCategory ?? null;
    applyMode(lastMode === 'select' ? 'select' : lastMode, lastCategory ?? '');
    this.unsubscribeEngine = engine.subscribe(() => {
      const snap = engine.getSnapshot().draw;
      const mode = snap.drawMode;
      const category = snap.pendingCategory ?? '';
      if (mode !== lastMode || category !== lastCategory) {
        lastMode = mode;
        lastCategory = category;
        applyMode(mode === 'select' ? 'select' : mode, category);
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
            engine.drawing.updateCircle(typeId, { center: newCenter, radiusMeters: newRadius });
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