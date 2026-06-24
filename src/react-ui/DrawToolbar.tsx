import { useState, type ReactNode } from 'react';
import type { DrawMode } from '../renderer-2d';

export interface DrawTool {
  mode: DrawMode;
  label: string;
  icon?: ReactNode;
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
  onStartDrawing?: (mode: DrawMode, category?: string) => void;
  onSelectMode?: () => void;
}

export function DrawToolbar({
  className = 'draw-toolbar',
  tools = DEFAULT_DRAW_TOOLS,
  onStartDrawing,
  onSelectMode,
}: DrawToolbarProps) {
  const [activeMode, setActiveMode] = useState<DrawMode>('select');
  const [activeLabel, setActiveLabel] = useState<string>('Select');

  const isActive = (mode: DrawMode, label: string): boolean => {
    if (mode === 'select') return activeMode === 'select';
    return activeMode === mode && activeLabel === label;
  };

  const handle = (mode: DrawMode, label: string) => {
    setActiveMode(mode);
    setActiveLabel(label);
    if (mode === 'select') {
      onSelectMode?.();
    } else {
      onStartDrawing?.(mode, label);
    }
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
