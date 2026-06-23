/**
 * @gsbio/react — React bindings for @gsbio/core.
 *
 * Export hooks, the `EngineProvider` / `AppProvider`, and the
 * renderer-agnostic `Canvas` host. This package contains no simulation logic
 * and no rendering-backend code — it only maps the engine's state into React.
 */

import type { DrawAction, DrawMode, ModelAction } from '@gsbio/core';
export type { DrawAction, DrawMode, ModelAction };

export { EngineProvider, useEngine, useEngineState, useDraw, useModel, useRun, useResults } from './useEngine';
export type { EngineProviderProps, DrawHook, ModelHook, RunHook, ResultsHook } from './useEngine';
export { AppProvider } from './AppProvider';
export type { AppProviderProps } from './AppProvider';
export { Canvas } from './Canvas';
export type { CanvasProps } from './Canvas';
export { DataSourceProvider, useDataSources } from './providers/DataSourceProvider';