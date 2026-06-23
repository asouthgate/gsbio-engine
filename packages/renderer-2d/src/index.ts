/**
 * @gsbio/renderer-2d — 2D renderer plugin for @gsbio/core.
 *
 * Backed by MapLibre + TerraDraw. Consumes engine state via the `Renderer`
 * port defined in `@gsbio/core` and is hosted by `@gsbio/react`'s
 * `<Canvas>` component.
 */

export {
  TerraDraw2DRenderer,
  createTerraDraw2DRenderer,
  type TerraDraw2DOptions,
} from './TerraDraw2DRenderer';