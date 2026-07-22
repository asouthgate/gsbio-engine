/**
 * Palette token resolver.
 *
 * The map style is a large static MapLibre JSON document
 * ({@link STYLE_TEMPLATE}) whose colours are expressed as symbolic tokens
 * such as `"$palette.land"` or `"$palette.water"` rather than as hard-coded
 * colour strings.  This keeps the style definition independent of any
 * particular colour scheme. The same template can produce a dark theme,
 * a light theme, or a client-branded map simply by swapping the palette.
 *
 * `resolvePaletteTokens` walks an arbitrary value tree (typically the parsed
 * style JSON) and replaces every `$palette.<key>` string with the corresponding
 * value from a {@link MapPalette}.  Everything else — numbers, booleans,
 * non-matching strings — passes through unchanged.
 *
 * @example
 * ```ts
 * import { styleTemplate } from '../styles/style-template.json';
 * import { resolvePaletteTokens, STYLE_TEMPLATE } from '@gsbio/engine';
 *
 * const dark: MapPalette = {
 *   background: 'rgba(24, 26, 27, 1)',
 *   land: 'rgba(40, 44, 46, 1)',
 *   water: 'rgba(78, 122, 202, 1)',
 *   // ...
 * };
 *
 * const style = resolvePaletteTokens(STYLE_TEMPLATE, dark);
 * ```
 *
 * @example
 * Before and after for a single paint rule:
 * ```
 * // In the template:
 * "background-color": "$palette.background"
 *
 * // After resolution with a palette that has background='#1a1b1b':
 * "background-color": "#1a1b1b"
 * ```
 */

import type { MapPalette } from '../styles/palette';

/** Matches strings that are exactly `$palette.<key>` with a single
 *  word key (e.g. `"$palette.land"`, `"$palette.water"`). */
const TOKEN_RE = /^\$palette\.(\w+)$/;

/** Recursively walk a value tree, replacing `$palette.*` tokens found in
 *  string leaves with palette entries.  Strings that do not match the
 *  token pattern, and all non-string values, are returned as-is. */
function resolve(val: unknown, palette: MapPalette): unknown {
  if (typeof val === 'string') {
    const m = val.match(TOKEN_RE);
    if (m) {
      return m[1] in palette ? palette[m[1] as keyof MapPalette] : val;
    }
    return val;
  }
  if (Array.isArray(val)) {
    return val.map((v) => resolve(v, palette));
  }
  if (val !== null && typeof val === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(val as Record<string, unknown>)) {
      out[key] = resolve((val as Record<string, unknown>)[key], palette);
    }
    return out;
  }
  return val;
}

/** Resolve `$palette.*` tokens in a style object/array using the given
 *  palette.  Returns a deep copy of the style tree with tokens replaced
 *  by concrete values. The original input is never mutated. */
export function resolvePaletteTokens<T>(style: T, palette: MapPalette): T {
  return resolve(style, palette) as T;
}
