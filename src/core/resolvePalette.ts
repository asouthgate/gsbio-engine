import type { MapPalette } from '../styles/palette';

const TOKEN_RE = /^\$palette\.(\w+)$/;

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

export function resolvePaletteTokens<T>(style: T, palette: MapPalette): T {
  return resolve(style, palette) as T;
}
