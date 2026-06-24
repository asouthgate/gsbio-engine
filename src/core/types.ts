export * from './engine.featureStore.types';
export * from './engine.runController.types';
export * from './engine.modelRegistry.types';
export * from './spatial.types';


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
