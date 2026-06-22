import { useState } from 'react';
import { useResults } from '@catshark/react';
import type { RunStatus, RunSummary } from '@catshark/core';

const STATUS_TEXT: Record<RunStatus, string> = {
  idle: 'Idle',
  preprocessing: 'Preparing…',
  submitting: 'Submitting…',
  running: 'Running…',
  succeeded: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function timeOf(ts: number | null): string {
  if (ts == null) return '';
  return new Date(ts).toLocaleTimeString();
}

function RunRow({
  rec,
  onToggle,
  onClear,
  onToggleLayer,
}: {
  rec: RunSummary;
  onToggle: () => void;
  onClear: () => void;
  onToggleLayer: (layerId: string) => void;
}) {
  const canShow = rec.status === 'succeeded' && rec.layerIds.length > 0;
  const [expanded, setExpanded] = useState(false);
  // Master toggle reads the whole-run state: indeterminate when partial.
  // The button label adapts so the user knows the next action.
  const label = rec.partial
    ? 'Show all on map'
    : rec.visible
      ? 'Hide on map'
      : 'Show on map';
  const hasMulti = rec.layerIds.length > 1;

  return (
    <li className={`run-item run-item--${rec.status}${rec.visible ? ' run-item--visible' : ''}${rec.partial ? ' run-item--partial' : ''}`}>
      <div className="run-item__head">
        <span className="run-item__name">{rec.modelId} · {timeOf(rec.startedAt)}</span>
        <span className="run-item__status">{STATUS_TEXT[rec.status]}</span>
      </div>
      {rec.error && <p className="run-item__error">{rec.error}</p>}
      <div className="run-item__actions">
        {canShow && (
          <button
            type="button"
            className="btn btn-ghost run-item__toggle"
            onClick={onToggle}
            aria-pressed={rec.visible && !rec.partial}
          >
            {label}
          </button>
        )}
        {canShow && hasMulti && (
          <button
            type="button"
            className="btn btn-ghost run-item__expand"
            onClick={() => setExpanded((v) => !v)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Collapse layers' : 'Expand layers'}
          >
            {expanded ? '▾' : '▸'}
          </button>
        )}
        <button
          type="button"
          className="btn btn-ghost run-item__clear"
          onClick={onClear}
          aria-label="Dismiss run"
        >
          ✕
        </button>
      </div>
      {canShow && hasMulti && expanded && (
        <ul className="run-item__layers">
          {rec.layerIds.map((layerId) => {
            const checked = rec.visibleLayerIds.includes(layerId);
            return (
              <li key={layerId} className="run-item__layer">
                <label className="run-item__layer-label">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => onToggleLayer(layerId)}
                  />
                  <span className="run-item__layer-id">{layerId}</span>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </li>
  );
}

export interface ResultsPanelProps {
  className?: string;
}

/**
 * `<ResultsPanel>` — list of runs, each with a "Show on map" master toggle plus
 * per-layer checkboxes when the run yields more than one addressable result
 * layer. A run whose `submit` returned zero layers (summary-only) shows no
 * toggle at all.
 *
 * **Stable class names** (themed by the host app; no shipped CSS here):
 * `.results-panel` (root, default from `className`)
 * `.results-panel__header` (toolbar row with title + Clear all)
 * `.run-list` (`<ul>`)
 * `.run-item` (each row)
 * `.run-item--succeeded | --failed | --cancelled | --visible | --partial` (state)
 * `.run-item__head`, `__name`, `__status`, `__error`, `__actions`
 * `.run-item__toggle` (master show/hide-all button)
 * `.run-item__expand` (collapse/expand the per-layer sub-list)
 * `.run-item__clear` (dismissal ✕ button)
 * `.run-item__layers` (`<ul>` of per-layer rows)
 * `.run-item__layer` (one per result layer) + `__layer-label`, `__layer-id`
 * `.results-empty` (placeholder shown when there are no runs)
 */
export function ResultsPanel({ className = 'results-panel' }: ResultsPanelProps) {
  const { summaries, toggleResult, toggleResultLayer, clearResult, clearAll } = useResults();
  const rows = summaries;

  return (
    <div className={className}>
      <div className="results-panel__header">
        <h3>Results</h3>
        {rows.length > 0 && (
          <button type="button" className="btn btn-ghost" onClick={clearAll}>
            Clear all
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="results-empty">No runs yet.</p>
      ) : (
        <ul className="run-list">
          {rows.map((r) => (
            <RunRow
              key={r.runId}
              rec={r}
              onToggle={() => toggleResult(r.runId)}
              onToggleLayer={(layerId) => toggleResultLayer(r.runId, layerId)}
              onClear={() => clearResult(r.runId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}