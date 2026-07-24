import type { DataFeature } from './engine.feature.types';
import type { ModelParams } from './engine.modelRegistry.types';
import type { MapLayerEnvelope } from './spatial.types';

export interface RunState {
  current: RunRecord | null;
  history: RunRecord[];
}

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
  features: ReadonlyArray<DataFeature>;
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


export type RunResult = { layers: ResultLayerEntry[]; summary?: unknown };

export interface ResultLayerEntry {
  id: string;
  name?: string;
  envelope: MapLayerEnvelope;
}

export interface RunResultLayers {
  layers: ResultLayerEntry[];
  summary?: unknown;
}


export function extractResultLayers(result: RunResult): ResultLayerEntry[] {
  const out: ResultLayerEntry[] = [];
  for (const item of result.layers) {
    if (typeof item !== 'object' || item === null) continue;
    if (typeof item.id !== 'string' || typeof item.envelope?.kind !== 'string') continue;
    out.push(item);
  }
  return out;
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
  taskId?: string;
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
  layerNames: Record<string, string>;
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
  layerNames: Record<string, string>;
  visibleLayerIds: string[];
  visible: boolean;
  partial: boolean;
}

export interface ResultLayerActions {
  addResultLayer: (runId: string, layerId: string, envelope: MapLayerEnvelope) => void;
  removeResultLayer: (runId: string, layerId: string) => void;
  setRasterOpacity: (opacity: number) => void;
}