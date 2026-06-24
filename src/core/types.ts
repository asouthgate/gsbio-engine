import type { LngLat } from './spatial';

export type GeometryKind = 'point' | 'linestring' | 'polygon' | 'circle';
export type DrawMode = 'select' | GeometryKind;

export interface CircleGeometry {
  center: LngLat;
  radiusMeters: number;
}

export interface DrawnFeature {
  id: string;
  geometryKind: GeometryKind;
  category: string;
  label: string;
  visible: boolean;
  geojson: GeoJSON.Feature;
  // Special handling for circle types
  circle?: CircleGeometry;
}

export interface DrawMapActions {
  removeFeatureFromMap: (id: string) => void;
  setFeatureVisibility: (id: string, visible: boolean, geojson: GeoJSON.Feature) => void;
  updateFeatureGeometry: (id: string, geojson: GeoJSON.Feature) => void;
}

// Defines types allowable for model params. Future extensions expected.
export type ParamType = 'number' | 'range';

export interface ModelParamDef {
  key: string;
  label: string;
  type: ParamType;
  min?: number;
  max?: number;
  step?: number;
  default: number;
}

export interface ModelDef {
  id: string;
  name: string;
  description?: string;
  params: ModelParamDef[];
}

export type ModelParams = Record<string, number>;
export type RunLogLevel = 'info' | 'warning' | 'error';

export interface RunLogEntry {
  ts: number; // epoch ms timestamp
  level: RunLogLevel;
  message: string;
}

// Input to an `Executor.preprocess`
export interface PreprocessContext {
  modelId: string;
  params: ModelParams;
  features: ReadonlyArray<DrawnFeature>;
  onLog?: (level: RunLogLevel, message: string) => void;
}

export type PreprocessedPayload = unknown; // type just has to be consistent
export interface PreprocessResult {
  payload: PreprocessedPayload;
}
export interface SubmitContext {
  modelId: string;
  params: ModelParams;
  payload: PreprocessedPayload;
  onProgress?: (progress: RunProgress) => void;
  onLog?: (level: RunLogLevel, message: string) => void;
}

export type MapLayerEnvelope =
  | { kind: 'geojson'; data: GeoJSON.FeatureCollection }
  | { kind: 'tiles'; url: string; sourceLayer?: string; type: 'raster' | 'vector' }
  | { kind: 'image'; url: string; bounds: [number, number, number, number] };

export type RunResult = unknown;
export interface RunResultEnvelope {
  layer: MapLayerEnvelope;
  summary?: unknown;
}
export interface ResultLayerEntry {
  id: string;
  envelope: MapLayerEnvelope;
}

export interface RunResultLayers {
  layers: ResultLayerEntry[];
  summary?: unknown;
}

// Runtime type guard
function isMapLayerEnvelope(v: unknown): v is MapLayerEnvelope {
  return typeof v === 'object' && v !== null && typeof (v as Record<string, unknown>).kind === 'string';
}

/** Narrow a `RunResult` into a list of addressable result layers. Handles
 *  the three conventions: explicit `{ layers }`, the single-layer
 *  shorthand (bare envelope or `{ layer }`), and the zero-layer case. The
 *  single-layer shorthand yields one entry whose `id` is `defaultId` (the
 *  caller passes the run id). */
export function extractResultLayers(
  result: RunResult,
  defaultId = 'default',
): ResultLayerEntry[] {
  if (!isMapLayerEnvelope(result)) {
    if (typeof result === 'object' && result !== null) {
      const r = result as Record<string, unknown>;
      const layers = r.layers;
      if (Array.isArray(layers)) {
        const out: ResultLayerEntry[] = [];
        for (const item of layers) {
          if (typeof item !== 'object' || item === null) continue;
          const it = item as Record<string, unknown>;
          if (typeof it.id === 'string' && isMapLayerEnvelope(it.envelope)) {
            out.push({ id: it.id, envelope: it.envelope });
          }
        }
        return out;
      }
      if (isMapLayerEnvelope(r.layer)) {
        return [{ id: defaultId, envelope: r.layer }];
      }
    }
    return [];
  }
  return [{ id: defaultId, envelope: result }];
}

export function extractLayerEnvelope(result: RunResult): MapLayerEnvelope | null {
  const layers = extractResultLayers(result);
  return layers.length > 0 ? layers[0]!.envelope : null;
}

export interface Executor {
  preprocess(ctx: PreprocessContext, signal: AbortSignal): PreprocessResult | Promise<PreprocessResult>;
  submit(ctx: SubmitContext, signal: AbortSignal): Promise<RunResult>;
}

export type RunStatus =
  | 'idle'
  | 'preprocessing'
  | 'submitting'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export interface RunProgress {
  step: RunProgressStep;
  fraction?: number;
  label?: string;
}

export type RunProgressStep = 'preprocess' | 'submit' | 'stream';

export interface RunRecord {
  runId: string;
  modelId: string;
  params: ModelParams;
  status: RunStatus;
  // null until the run succeeds
  result: RunResult | null;
  error: string | null;
  progress: RunProgress | null;
  startedAt: number;
  finishedAt: number | null;
  log: RunLogEntry[];
  layerIds: string[];
  visibleLayerIds: string[];
  visible: boolean;
}

export interface RunSummary {
  runId: string;
  modelId: string;
  status: RunStatus;
  error: string | null;
  progress: RunProgress | null;
  startedAt: number;
  finishedAt: number | null;
  log: RunLogEntry[];
  warnings: string[];
  layerIds: string[];
  visibleLayerIds: string[];
  visible: boolean;
  partial: boolean;
}

export interface ResultLayerActions {
  addResultLayer: (runId: string, layerId: string, envelope: MapLayerEnvelope) => void;
  removeResultLayer: (runId: string, layerId: string) => void;
}


export type DataSourceKind = 'drawn' | 'upload';

export interface DataSourceDef {
  id: string;
  name: string;
  kind: DataSourceKind;
  featureIds: ReadonlyArray<string>;
}

export interface Renderer {
  mount(container: HTMLElement, engine: unknown): void | Promise<void>;
  unmount(): void | Promise<void>;
}