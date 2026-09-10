// Defines types allowable for model params. Future extensions expected.
export type ParamType = 'number' | 'range' | 'select' | 'boolean';

export interface ModelParamOption {
  value: number;
  label: string;
}

export interface ModelParamDef {
  key: string;
  label: string;
  type: ParamType;
  min?: number;
  max?: number;
  step?: number;
  default: number;
  /** Options for `type: 'select'`. */
  options?: ModelParamOption[];
  /** Group label; params sharing a group are rendered together. */
  group?: string;
  /** Hide from generic auto-generated forms (driven by dedicated UI). */
  hidden?: boolean;
}

/**
 * A named stage in a model's workflow. When a model declares stages, the
 * engine tracks the current stage in `ModelState` and exposes it to the
 * executor via its context, so multi-step pipelines need no external state.
 */
export interface ModelStageDef {
  key: string;
  label: string;
  /** Layer to auto-show after a run on this stage; `null`/omitted shows all. */
  defaultLayerId?: string | null;
}

export interface ModelDef {
  id: string;
  name: string;
  description?: string;
  params: ModelParamDef[];
  stages?: ModelStageDef[];
  /** Fallback layer to auto-show when no stage (or no stage default) applies. */
  defaultLayerId?: string | null;
  /** Layer ids to auto-show after a successful run (takes priority over defaultLayerId). */
  autoShowLayerIds?: string[];
}

export type ModelParams = Record<string, number>;