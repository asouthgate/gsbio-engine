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