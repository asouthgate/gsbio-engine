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

function RunRow({ rec, onToggle, onClear }: { rec: RunSummary; onToggle: () => void; onClear: () => void }) {
  const canShow = rec.status === 'succeeded';
  return (
    <li className={`run-item run-item--${rec.status}${rec.visible ? ' run-item--visible' : ''}`}>
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
            aria-pressed={rec.visible}
          >
            {rec.visible ? 'Hide on map' : 'Show on map'}
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
    </li>
  );
}

export interface ResultsPanelProps {
  className?: string;
}

/**
 * `<ResultsPanel>` — list of past runs with per-row "Show on map" toggle.
 *
 * **Stable class names** (themed by the host app; no shipped CSS here):
 * `.results-panel` (root, default from `className`)
 * `.results-panel__header` (toolbar row with title + Clear all)
 * `.run-list` (`<ul>`)
 * `.run-item` (each row)
 * `.run-item--succeeded | --failed | --cancelled | --visible` (state modifiers)
 * `.run-item__head`, `__name`, `__status`, `__error`, `__actions`
 * `.run-item__toggle` (the show/hide button)
 * `.run-item__clear` (the dismissal ✕ button)
 * `.results-empty` (placeholder shown when there are no runs)
 */
export function ResultsPanel({ className = 'results-panel' }: ResultsPanelProps) {
  const { summaries, toggleResult, clearResult, clearAll } = useResults();
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
              onClear={() => clearResult(r.runId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}