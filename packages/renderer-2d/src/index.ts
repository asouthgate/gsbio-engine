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
  type ShapePaint,
  type FeatureToolStyle,
  type FeatureStyleConfig,
  type ResultPaint,
  DEFAULT_FEATURE_STYLES,
  DEFAULT_RESULT_PAINT,
} from './TerraDraw2DRenderer';