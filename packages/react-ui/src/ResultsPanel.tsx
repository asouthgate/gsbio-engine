import { useState } from 'react';
import { useResults } from '@gsbio/react';
import type { RunLogEntry, RunStatus, RunSummary } from '@gsbio/core';

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

/** Compact `HH:MM:SS.mmm` for a log entry timestamp — keeps audit rows
 *  scannable in the full-page view. */
function logTimeOf(ts: number): string {
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  const ms = String(d.getMilliseconds()).padStart(3, '0');
  return `${hh}:${mm}:${ss}.${ms}`;
}

function RunRow({
  rec,
  onToggle,
  onClear,
  onToggleLayer,
  onViewLog,
}: {
  rec: RunSummary;
  onToggle: () => void;
  onClear: () => void;
  onToggleLayer: (layerId: string) => void;
  onViewLog?: () => void;
}) {
  const canShow = rec.status === 'succeeded' && rec.layerIds.length > 0;
  const [expanded, setExpanded] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  // Master toggle reads the whole-run state: indeterminate when partial.
  // The button label adapts so the user knows the next action.
  const label = rec.partial
    ? 'Show all on map'
    : rec.visible
      ? 'Hide on map'
      : 'Show on map';
  const hasMulti = rec.layerIds.length > 1;
  const hasWarnings = rec.warnings.length > 0;
  const hasLog = rec.log.length > 0;

  return (
    <li className={`run-item run-item--${rec.status}${rec.visible ? ' run-item--visible' : ''}${rec.partial ? ' run-item--partial' : ''}`}>
      <div className="run-item__head">
        <span className="run-item__name">{rec.modelId} · {timeOf(rec.startedAt)}</span>
        <span className="run-item__status">{STATUS_TEXT[rec.status]}</span>
      </div>
      {rec.error && <p className="run-item__error">{rec.error}</p>}
      {hasWarnings && (
        <ul className="run-item__warnings">
          {rec.warnings.map((w, i) => (
            <li key={i} className="run-item__warning">⚠ {w}</li>
          ))}
        </ul>
      )}
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
        {hasLog && (
          <button
            type="button"
            className="btn btn-ghost run-item__log-toggle"
            onClick={() => (onViewLog ? onViewLog() : setLogExpanded((v) => !v))}
            aria-expanded={onViewLog ? undefined : logExpanded}
            aria-label={onViewLog ? 'Open full-page log' : 'Toggle inline log'}
            title={onViewLog ? 'Open full-page log' : 'Toggle inline log'}
          >
            Log ({rec.log.length})
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
      {hasLog && !onViewLog && logExpanded && (
        <ul className="run-item__log">
          {rec.log.map((e: RunLogEntry, i) => (
            <li
              key={i}
              className={`run-item__log-entry run-item__log-entry--${e.level}`}
            >
              <span className="run-item__log-time">{logTimeOf(e.ts)}</span>
              <span className="run-item__log-message">{e.message}</span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

export interface ResultsPanelProps {
  className?: string;
  /** When provided, the per-row "Log (N)" button opens this instead of the
   *  inline expander — e.g. to launch a full-page modal. The host owns the
   *  modal; the panel just hands back the run id. */
  onViewLog?: (runId: string, log: RunLogEntry[]) => void;
}

/**
 * `<ResultsPanel>` — list of runs, each with a "Show on map" master toggle plus
 * per-layer checkboxes when the run yields more than one addressable result
 * layer. A run whose `submit` returned zero layers (summary-only) shows no
 * toggle at all. Warnings emitted by the executor (via `ctx.onLog`) render as
 * an amber block; the run's audit log is reachable via a per-row "Log" button
 * (inline expander by default, or full-page modal when `onViewLog` is wired).
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
 * `.run-item__warnings` (`<ul>` of amber warning lines) + `__warning`
 * `.run-item__log-toggle` (the inline-expander / "open full log" button)
 * `.run-item__log` (`<ul>` of inline log rows)
 * `.run-item__log-entry` + `--info | --warning | --error` + `__log-time`, `__log-message`
 * `.results-empty` (placeholder shown when there are no runs)
 */
export function ResultsPanel({ className = 'results-panel', onViewLog }: ResultsPanelProps) {
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
              onViewLog={onViewLog ? () => onViewLog(r.runId, r.log) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}