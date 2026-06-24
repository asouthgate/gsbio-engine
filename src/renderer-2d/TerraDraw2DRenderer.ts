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
  LngLat,
  type DrawnFeature,
  type DrawMode,
  type Renderer,
  type SimulationEngine,
} from '../core';
import { MapManager } from './mapManager';

export interface ShapePaint { fillColor?: string; fillOpacity?: number; outlineColor?: string; outlineWidth?: number; pointColor?: string; pointOutlineColor?: string; pointRadius?: number; lineColor?: string; lineWidth?: number; }
export interface FeatureToolStyle { mode: DrawMode; category: string; style: ShapePaint; }
export interface FeatureStyleConfig { point?: ShapePaint; linestring?: ShapePaint; polygon?: ShapePaint; circle?: ShapePaint; tools?: FeatureToolStyle[]; }
export interface ResultPaint { fillColor?: string; fillOpacity?: number; lineColor?: string; lineWidth?: number; circleColor?: string; circleRadius?: number; }
export interface TerraDraw2DOptions { style: any; center?: [number, number]; zoom?: number; featureStyles?: FeatureStyleConfig; resultStyles?: ResultPaint; }

export const DEFAULT_FEATURE_STYLES: Record<DrawMode, ShapePaint> = {
  select: {},
  point: { pointColor: '#2dd4bf', pointOutlineColor: '#222f35', pointRadius: 6 },
  linestring: { lineColor: '#2dd4bf', lineWidth: 2 },
  polygon: { fillColor: '#2dd4bf', fillOpacity: 0.18, outlineColor: '#5eead4', outlineWidth: 2 },
  circle: { fillColor: '#2dd4bf', fillOpacity: 0.12, outlineColor: '#5eead4', outlineWidth: 2 },
};
export const DEFAULT_RESULT_PAINT: Required<ResultPaint> = { fillColor: '#E69F00', fillOpacity: 0.25, lineColor: '#E69F00', lineWidth: 2, circleColor: '#E69F00', circleRadius: 5 };

function compositeModeName(drawMode: DrawMode, category: string): string { return `${drawMode}__${category}`; }
function mergePaint(base: ShapePaint, override: ShapePaint | undefined): ShapePaint { return override ? { ...base, ...override } : { ...base }; }
function toPointStyles(p: ShapePaint): Record<string, unknown> { const s: any = {}; if (p.pointColor ?? p.fillColor) s.pointColor = p.pointColor ?? p.fillColor; if (p.pointRadius != null) s.pointWidth = p.pointRadius; if (p.pointOutlineColor ?? p.outlineColor) s.pointOutlineColor = p.pointOutlineColor ?? p.outlineColor; return s; }
function toLineStringStyles(p: ShapePaint): Record<string, unknown> { const s: any = {}; if (p.lineColor ?? p.outlineColor) s.lineStringColor = p.lineColor ?? p.outlineColor; if (p.lineWidth ?? p.outlineWidth) s.lineStringWidth = p.lineWidth ?? p.outlineWidth; return s; }
function toPolygonStyles(p: ShapePaint): Record<string, unknown> { const s: any = {}; if (p.fillColor) s.fillColor = p.fillColor; if (p.fillOpacity != null) s.fillOpacity = p.fillOpacity; if (p.outlineColor) s.outlineColor = p.outlineColor; if (p.outlineWidth != null) s.outlineWidth = p.outlineWidth; return s; }


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

export class TerraDraw2DRenderer implements Renderer {
  private mapManager!: MapManager;
  private draw: TerraDrawLike | null = null;
  private unsubscribeEngine: (() => void) | null = null;
  private readonly featurePaints: Record<DrawMode, ShapePaint>;
  private readonly compositeModes = new Map<string, { drawMode: DrawMode; category: string; style: ShapePaint }>();

  constructor(private readonly options: TerraDraw2DOptions) {
    const fs = options.featureStyles ?? {};
    this.featurePaints = {
      select: {},
      point: mergePaint(DEFAULT_FEATURE_STYLES.point, fs.point),
      linestring: mergePaint(DEFAULT_FEATURE_STYLES.linestring, fs.linestring),
      polygon: mergePaint(DEFAULT_FEATURE_STYLES.polygon, fs.polygon),
      circle: mergePaint(DEFAULT_FEATURE_STYLES.circle, fs.circle),
    };
    for (const t of fs.tools ?? []) {
      if (t.mode === 'select') continue;
      const name = compositeModeName(t.mode, t.category);
      this.compositeModes.set(name, { drawMode: t.mode, category: t.category, style: t.style });
    }
  }

  private updateCircleState(feature: GeoJSON.Feature, id: string): any {
      if (feature.geometry.type !== 'Polygon') return null;
      const geom = feature.geometry as GeoJSON.Polygon;
      const ring = geom.coordinates[0].map(([lng, lat]) => ({ lng, lat }));
      const props = (feature.properties ?? {}) as any;
      const radiusMeters = (props.radiusKilometers ? Number(props.radiusKilometers) : 0) * 1000;
      return { center: centroid(ring), radiusMeters };
  }

  async mount(container: HTMLElement, engineInstance: unknown): Promise<void> {
    const engine = engineInstance as SimulationEngine;
    this.mapManager = new MapManager(this.options, { ...DEFAULT_RESULT_PAINT, ...this.options.resultStyles });
    const map = await this.mapManager.mount(container);

    const adapter = new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: 9 });
    // const compositeModeInstances = Array.from(this.compositeModes.keys()).map((name) => {
    //   const entry = this.compositeModes.get(name)!;
    //   const paint = mergePaint(this.featurePaints[entry.drawMode], entry.style);
    //   if (entry.drawMode === 'point') return new TerraDrawPointMode({ modeName: name, styles: toPointStyles(paint) });
    //   if (entry.drawMode === 'linestring') return new TerraDrawLineStringMode({ modeName: name, styles: toLineStringStyles(paint) });
    //   return new TerraDrawPolygonMode({ modeName: name, styles: toPolygonStyles(paint) });
    // });

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
      addResultLayer: (rid, lid, env) => this.mapManager.addResultLayer(rid, lid, env),
      removeResultLayer: (rid, lid) => this.mapManager.removeResultLayer(rid, lid),
    });

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
    applyMode(lastMode === 'select' || lastMode === null ? 'select' : lastMode, lastCategory ?? '');
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
      const existing = snapshot.features.find((f: DrawnFeature) => f.id === typeId);
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
            geometryKind: engine.drawing.geometryKindForMode(snapshot.drawMode),
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
      const existing = engine.getSnapshot().draw.features.find((f: DrawnFeature) => f.id === typeId);
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
    this.unsubscribeEngine?.();
    this.draw?.stop();
    this.draw = null;
    this.mapManager.unmount();
  }
}

export function createTerraDraw2DRenderer(options: TerraDraw2DOptions): TerraDraw2DRenderer {
  return new TerraDraw2DRenderer(options);
}