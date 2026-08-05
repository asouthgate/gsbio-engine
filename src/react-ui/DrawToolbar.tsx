import { type ReactNode } from 'react';
import { useEngine, useEngineState } from '../react';
import type { DrawMode } from '../renderer-2d';

export interface DrawTool {
  mode: DrawMode;
  label: string;
  icon?: ReactNode;
  category?: string;
  options?: Record<string, unknown>;
}

export const DEFAULT_DRAW_TOOLS: readonly DrawTool[] = [
  { mode: 'select', label: 'Select' },
  { mode: 'point', label: 'Point' },
  { mode: 'linestring', label: 'Line' },
  { mode: 'polygon', label: 'Polygon' },
  { mode: 'circle', label: 'Circle' },
];

const MODE_ICONS: Record<string, string> = {
  select: '☝',
  point: '◉',
  linestring: '〰',
  polygon: '⬡',
  circle: '○',
};

export interface DrawToolbarProps {
  className?: string;
  tools?: readonly DrawTool[];
}

export function DrawToolbar({
  className = 'draw-toolbar',
  tools = DEFAULT_DRAW_TOOLS,
}: DrawToolbarProps) {
  const engine = useEngine();
  const { drawMode } = useEngineState();

  const isActive = (mode: DrawMode, label: string, category?: string): boolean => {
    const cat = category ?? label;
    if (mode === 'select') return drawMode.mode === 'select';
    return drawMode.mode === mode && drawMode.category === cat;
  };

  const handle = (mode: DrawMode, label: string, category?: string) => {
    engine.setDrawMode(mode, category ?? label);
  };

  let separatorPlaced = false;

  return (
    <div className={className}>
      {tools.map((t, i) => {
        const showSep = !separatorPlaced && t.mode !== 'select';
        if (showSep) separatorPlaced = true;
        return (
          <span key={i} style={{ display: 'contents' }}>
            {showSep && <span className="draw-toolbar-separator" />}
            <button
              className={`draw-btn draw-btn--${t.mode} ${isActive(t.mode, t.label, t.category) ? 'active' : ''}`}
              onClick={() => handle(t.mode, t.label, t.category)}
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
