import { type ReactNode } from 'react';
import { useDraw } from '../react';
import type { DrawMode } from '../core';

/**
 * A single tool entry in the toolbar. Two tools may share a `mode` (e.g. two
 * `circle` tools, one labelled "Roost" and one "Light Source"); the label
 * becomes the created feature's `category`, so features are later retrievable
 * by category via `featuresByCategory()`.
 */
export interface DrawTool {
  mode: DrawMode;
  label: string;
  /**
   * Optional icon. May be a string (emoji/char), an SVG component, or any
   * renderable ReactNode. Omit to fall back to the engine's default glyph
   * for `mode` (see `MODE_ICONS`).
   */
  icon?: ReactNode;
}

/** Default tools — every logical mode with its default label. */
export const DEFAULT_DRAW_TOOLS: readonly DrawTool[] = [
  { mode: 'select', label: 'Select' },
  { mode: 'point', label: 'Point' },
  { mode: 'linestring', label: 'Line' },
  { mode: 'polygon', label: 'Polygon' },
  { mode: 'circle', label: 'Circle' },
];

const MODE_ICONS: Record<DrawMode, string> = {
  select: '☝',
  point: '◉',
  linestring: '〰',
  polygon: '⬡',
  circle: '○',
};

export interface DrawToolbarProps {
  className?: string;
  /**
   * Tools to show; order in the array determines button order. Defaults to
   * all five modes with default labels when omitted.
   */
  tools?: readonly DrawTool[];
}

export function DrawToolbar({
  className = 'draw-toolbar',
  tools = DEFAULT_DRAW_TOOLS,
}: DrawToolbarProps) {
  const { state, startDrawing, selectMode } = useDraw();

  const isActive = (mode: DrawMode, label: string): boolean => {
    if (mode === 'select') return state.drawMode === 'select';
    // pendingCategory distinguishes two tools sharing a mode.
    return state.drawMode === mode && state.pendingCategory === label;
  };

  const handle = (mode: DrawMode, label: string) => {
    if (mode === 'select') selectMode();
    else startDrawing(mode, label);
  };

  let separatorPlaced = false;

  return (
    <div className={className}>
      {tools.map((t, i) => {
        // A separator before the first non-Select tool splits the toolbar into
        // "navigation" and "drawing" groups — mirrors a freehand's compass.
        const showSep = !separatorPlaced && t.mode !== 'select';
        if (showSep) separatorPlaced = true;
        return (
          <span key={i} style={{ display: 'contents' }}>
            {showSep && <span className="draw-toolbar-separator" />}
            <button
              className={`draw-btn draw-btn--${t.mode} ${isActive(t.mode, t.label) ? 'active' : ''}`}
              onClick={() => handle(t.mode, t.label)}
              title={t.label}
            >
              <span className="draw-btn-icon">{t.icon ?? MODE_ICONS[t.mode]}</span>
              <span className="draw-btn-label">{t.label}</span>
            </button>
          </span>
        );
      })}
    </div>
  );
}