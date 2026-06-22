/**
 * @catshark/renderer-2d — 2D renderer plugin for @catshark/core.
 *
 * Backed by MapLibre + TerraDraw. Consumes engine state via the `Renderer`
 * port defined in `@catshark/core` and is hosted by `@catshark/react`'s
 * `<Canvas>` component.
 */

export {
  TerraDraw2DRenderer,
  createTerraDraw2DRenderer,
  type TerraDraw2DOptions,
} from './TerraDraw2DRenderer';