import {
  TerraDraw,
} from 'terra-draw';
import { TerraDrawMapLibreGLAdapter } from 'terra-draw-maplibre-gl-adapter';
import type { Renderer, SimulationEngine, DataFeature } from '../core';
import { MapManager } from './mapManager';
import { createAllModes } from './modes';
import { wireEvents, type DrawControl } from './bridge';
import { mergePaint } from './styles';
import type { DrawMode, TerraDrawLike, TerraDraw2DOptions, ShapePaint, ResultPaint } from './types';
import { DEFAULT_FEATURE_STYLES, DEFAULT_RESULT_PAINT } from './types';

export type { ShapePaint, FeatureToolStyle, FeatureStyleConfig, ResultPaint, TerraDraw2DOptions, DrawMode } from './types';
export { DEFAULT_FEATURE_STYLES, DEFAULT_RESULT_PAINT } from './types';

function compositeModeName(drawMode: DrawMode, category: string): string {
  return `${drawMode}__${category}`;
}

export class TerraDraw2DRenderer implements Renderer {
  private mapManager!: MapManager;
  private draw: TerraDrawLike | null = null;
  private cleanupBridge: (() => void) | null = null;
  private readonly featurePaints: Record<DrawMode, ShapePaint>;
  private readonly compositeModes = new Map<string, { drawMode: DrawMode; category: string; style: ShapePaint; maxRadiusMeters?: number }>();
  private _drawControl: DrawControl = { startDrawing: () => {}, selectMode: () => {} };

  startDrawing = (mode: DrawMode, category?: string) => {
    this._drawControl.startDrawing(mode, category);
  };

  selectMode = () => {
    this._drawControl.selectMode();
  };

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
      this.compositeModes.set(name, { drawMode: t.mode, category: t.category, style: t.style, maxRadiusMeters: t.maxRadiusMeters });
    }
  }

  private geometryKindForMode(mode: DrawMode): DataFeature['geometryKind'] {
    switch (mode) {
      case 'point': return 'point';
      case 'linestring': return 'linestring';
      case 'polygon': return 'polygon';
      case 'circle': return 'circle';
      default: return 'point';
    }
  }

  async mount(container: HTMLElement, engineInstance: unknown): Promise<void> {
    const engine = engineInstance as SimulationEngine;
    this.mapManager = new MapManager(
      { style: this.options.style, center: this.options.center, zoom: this.options.zoom, minZoom: this.options.minZoom, maxZoom: this.options.maxZoom, maxBounds: this.options.maxBounds, transformRequest: this.options.transformRequest, getToken: this.options.getToken, refreshToken: this.options.refreshToken },
      { ...DEFAULT_RESULT_PAINT, ...this.options.resultStyles },
    );
    const map = await this.mapManager.mount(container);

    const adapter = new TerraDrawMapLibreGLAdapter({ map, coordinatePrecision: 9 });

    const modes = createAllModes(this.featurePaints, this.compositeModes);

    const draw = new TerraDraw({
      adapter,
      modes,
    }) as unknown as TerraDrawLike;

    draw.start();
    this.draw = draw;

    const control = wireEvents(
      engine,
      draw,
      this.mapManager,
      this.compositeModes,
      this.geometryKindForMode.bind(this),
      this.options.defaultData,
    );

    this._drawControl = control;
    this.cleanupBridge = control.cleanup;
  }

  getMap(): maplibregl.Map | null {
    return this.mapManager?.instance ?? null;
  }

  unmount(): void {
    this.cleanupBridge?.();
    this.draw?.stop();
    this.draw = null;
    this.mapManager.unmount();
  }
}

export function createTerraDraw2DRenderer(options: TerraDraw2DOptions): TerraDraw2DRenderer {
  return new TerraDraw2DRenderer(options);
}
