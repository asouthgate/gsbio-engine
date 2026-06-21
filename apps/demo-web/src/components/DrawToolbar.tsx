import { useDraw, type DrawMode } from '@catshark/react';

const MODES: { mode: DrawMode; label: string; icon: string }[] = [
  { mode: 'select', label: 'Select', icon: '☝' },
  { mode: 'point', label: 'Point', icon: '◉' },
  { mode: 'linestring', label: 'Line', icon: '〰' },
  { mode: 'polygon', label: 'Polygon', icon: '⬡' },
];

export function DrawToolbar() {
  const { state, startDrawing, selectMode } = useDraw();

  const handle = (mode: DrawMode) => {
    if (mode === 'select') selectMode();
    else startDrawing(mode);
  };

  return (
    <div className="draw-toolbar">
      {MODES.map((m, i) => (
        <span key={m.mode} style={{ display: 'contents' }}>
          {i === 1 && <span className="draw-toolbar-separator" />}
          <button
            className={`draw-btn ${state.drawMode === m.mode ? 'active' : ''}`}
            onClick={() => handle(m.mode)}
            title={m.label}
          >
            <span className="draw-btn-icon">{m.icon}</span>
            <span className="draw-btn-label">{m.label}</span>
          </button>
        </span>
      ))}
    </div>
  );
}