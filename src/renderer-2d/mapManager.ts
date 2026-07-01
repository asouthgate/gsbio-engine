import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { TerraDraw2DOptions, ResultPaint } from './TerraDraw2DRenderer';

export class MapManager {
  private map: maplibregl.Map | null = null;
  private resultLayers = new Map<string, string[]>();
  private currentRasterOpacity = 0.8;

  constructor(private readonly options: TerraDraw2DOptions, private readonly resultPaint: Required<ResultPaint>) {}

  async mount(container: HTMLElement): Promise<maplibregl.Map> {
    this.unmount();
    this.map = new maplibregl.Map({
      container,
      style: this.options.style,
      center: this.options.center ?? [0, 0],
      zoom: this.options.zoom ?? 2,
    });
    await new Promise<void>((resolve) => this.map!.on('load', () => resolve()));
    return this.map;
  }

  get instance(): maplibregl.Map | null { return this.map; }

  private sourceId(runId: string, layerId: string): string { return `gsbio-result-${runId}__${layerId}`; }
  private layerKey(runId: string, layerId: string): string { return `${runId}__${layerId}`; }

  private getTerraDrawLayerId(): string | undefined {
    if (!this.map) return undefined;
    const layers = this.map.getStyle().layers;
    for (const layer of layers) {
      if (layer.id.startsWith('td-')) {
        return layer.id;
      }
    }
    return undefined;
  }

  setRasterOpacity(opacity: number) {
    this.currentRasterOpacity = Math.max(0, Math.min(1, opacity));
    if (!this.map) return;
    for (const [, layerIds] of this.resultLayers) {
      for (const id of layerIds) {
        if (id.endsWith('-raster')) {
          try { this.map.setPaintProperty(id, 'raster-opacity', this.currentRasterOpacity); } catch {}
        }
      }
    }
  }

  addResultLayer(runId: string, layerId: string, envelope: any) {
    if (!this.map) return;
    const srcId = this.sourceId(runId, layerId);
    const key = this.layerKey(runId, layerId);
    this.removeResultLayer(runId, layerId);

    const layerIds: string[] = [];
    const rp = this.resultPaint;
    const beforeId = this.getTerraDrawLayerId();

    if (envelope.kind === 'geojson') {
      this.map.addSource(srcId, { type: 'geojson', data: envelope.data });
      layerIds.push(`${srcId}-fill`, `${srcId}-line`, `${srcId}-circle`);
      this.map.addLayer({ id: `${srcId}-fill`, type: 'fill', source: srcId, filter: ['==', ['geometry-type'], 'Polygon'], paint: { 'fill-color': rp.fillColor, 'fill-opacity': rp.fillOpacity } }, beforeId);
      this.map.addLayer({ id: `${srcId}-line`, type: 'line', source: srcId, filter: ['==', ['geometry-type'], 'LineString'], paint: { 'line-color': rp.lineColor, 'line-width': rp.lineWidth } }, beforeId);
      this.map.addLayer({ id: `${srcId}-circle`, type: 'circle', source: srcId, filter: ['==', ['geometry-type'], 'Point'], paint: { 'circle-radius': rp.circleRadius, 'circle-color': rp.circleColor } }, beforeId);
    } else if (envelope.kind === 'image') {
      this.map.addSource(srcId, { type: 'image', url: envelope.url, coordinates: [[envelope.bounds[0], envelope.bounds[3]], [envelope.bounds[2], envelope.bounds[3]], [envelope.bounds[2], envelope.bounds[1]], [envelope.bounds[0], envelope.bounds[1]]] });
      layerIds.push(`${srcId}-raster`);
      this.map.addLayer({ id: `${srcId}-raster`, type: 'raster', source: srcId, paint: { 'raster-opacity': this.currentRasterOpacity } }, beforeId);
    } else {
      this.map.addSource(srcId, { type: envelope.type, tiles: [envelope.url], tileSize: 256 });
      if (envelope.type === 'raster') {
        layerIds.push(`${srcId}-raster`);
        this.map.addLayer({ id: `${srcId}-raster`, type: 'raster', source: srcId }, beforeId);
      } else {
        layerIds.push(`${srcId}-line`, `${srcId}-fill`);
        this.map.addLayer({ id: `${srcId}-line`, type: 'line', source: srcId, 'source-layer': envelope.sourceLayer, paint: { 'line-color': rp.lineColor, 'line-width': rp.lineWidth } }, beforeId);
        this.map.addLayer({ id: `${srcId}-fill`, type: 'fill', source: srcId, 'source-layer': envelope.sourceLayer, paint: { 'fill-color': rp.fillColor, 'fill-opacity': rp.fillOpacity } }, beforeId);
      }
    }
    this.resultLayers.set(key, layerIds);
  }

  removeResultLayer(runId: string, layerId: string) {
    if (!this.map) return;
    const key = this.layerKey(runId, layerId);
    const layerIds = this.resultLayers.get(key);
    layerIds?.forEach(id => { try { this.map!.removeLayer(id); } catch {} });
    try { this.map.removeSource(this.sourceId(runId, layerId)); } catch {}
    this.resultLayers.delete(key);
  }

  unmount() {
    this.resultLayers.clear();
    try { this.map?.remove(); } catch {}
    this.map = null;
  }
}