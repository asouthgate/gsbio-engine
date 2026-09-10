import maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import { PMTiles, type Source, type RangeResponse } from 'pmtiles';
import { TerraDraw2DOptions, ResultPaint } from './TerraDraw2DRenderer';

let pmtilesProtocolRegistered = false;
const pmtilesCache = new Map<string, PMTiles>();

export interface MapManagerOptions extends TerraDraw2DOptions {
  transformRequest?: maplibregl.RequestTransformFunction;
  getToken?: () => string | null | Promise<string | null>;
  refreshToken?: () => Promise<string | null>;
}

function createAuthSource(
  url: string,
  getToken: () => string | null | Promise<string | null>,
  refreshToken?: () => Promise<string | null>,
): Source {
  return {
    getKey: () => url,
    getBytes: async (offset: number, length: number, signal?: AbortSignal, etag?: string): Promise<RangeResponse> => {
      const buildHeaders = (token: string | null) => {
        const headers: Record<string, string> = {
          Range: `bytes=${offset}-${offset + length - 1}`,
        };
        if (etag) headers['If-Match'] = etag;
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
      };

      let resp = await fetch(url, { headers: buildHeaders(await getToken()), signal });

      // Stale token: force a fresh one and retry once.
      if (resp.status === 401 && refreshToken) {
        const fresh = await refreshToken();
        if (fresh) {
          resp = await fetch(url, { headers: buildHeaders(fresh), signal });
        }
      }

      if (!resp.ok) throw new Error(`PMTiles fetch failed: ${resp.status} ${resp.statusText}`);

      const data = await resp.arrayBuffer();
      return {
        data,
        etag: resp.headers.get('etag') ?? undefined,
        cacheControl: resp.headers.get('cache-control') ?? undefined,
      };
    },
  };
}

function registerPmtilesProtocol(
  getToken: () => string | null | Promise<string | null>,
  refreshToken?: () => Promise<string | null>,
) {
  if (pmtilesProtocolRegistered) return;

  maplibregl.addProtocol('pmtiles', async (params, abortController) => {
    const raw = params.url.replace('pmtiles://', '');
    const match = raw.match(/^(.+)\/(\d+)\/(\d+)\/(\d+)(?:\.\w+)?$/);
    if (!match) throw new Error(`Invalid PMTiles tile URL: ${raw}`);
    const pmtilesUrl = match[1];
    const z = parseInt(match[2], 10);
    const x = parseInt(match[3], 10);
    const y = parseInt(match[4], 10);

    let pmtiles = pmtilesCache.get(pmtilesUrl);
    if (!pmtiles) {
      const source = createAuthSource(pmtilesUrl, getToken, refreshToken);
      pmtiles = new PMTiles(source);
      pmtilesCache.set(pmtilesUrl, pmtiles);
    }

    const tile = await pmtiles.getZxy(z, x, y, abortController.signal);
    return { data: tile?.data ?? new ArrayBuffer(0) };
  });

  pmtilesProtocolRegistered = true;
}

export class MapManager {
  private map: maplibregl.Map | null = null;
  private resultLayers = new Map<string, string[]>();
  private currentRasterOpacity = 1.0;

  constructor(private readonly options: MapManagerOptions, private readonly resultPaint: Required<ResultPaint>) {}

  async mount(container: HTMLElement): Promise<maplibregl.Map> {
    this.unmount();

    if (this.options.getToken) {
      registerPmtilesProtocol(this.options.getToken, this.options.refreshToken);
    }

    this.map = new maplibregl.Map({
      container,
      style: this.options.style,
      center: this.options.center ?? [0, 0],
      zoom: this.options.zoom ?? 2,
      minZoom: this.options.minZoom,
      maxZoom: this.options.maxZoom,
      maxBounds: this.options.maxBounds,
      transformRequest: this.options.transformRequest,
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
      if (envelope.circleStyles && envelope.circleStyles.length > 0) {
        const styleProperty = envelope.styleProperty ?? 'kind';
        for (let i = 0; i < envelope.circleStyles.length; i++) {
          const s = envelope.circleStyles[i];
          const id = `${srcId}-circle-${i}`;
          layerIds.push(id);
          this.map.addLayer({
            id,
            type: 'circle',
            source: srcId,
            filter: ['==', ['get', styleProperty], s.value],
            paint: {
              'circle-radius': s.radius ?? rp.circleRadius,
              'circle-color': s.color ?? rp.circleColor,
              ...(s.strokeColor ? { 'circle-stroke-color': s.strokeColor } : {}),
              ...(s.strokeWidth != null ? { 'circle-stroke-width': s.strokeWidth } : {}),
            },
          }, beforeId);
        }
        this.resultLayers.set(key, layerIds);
        return;
      }
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