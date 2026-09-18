import { useState } from 'react';
import { useResults } from '../react';
import type { RunLogEntry, RunStatus, RunSummary } from '../core';

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
  onClear,
  onSelectLayer,
  onSelectNone,
  onOpacityChange,
  onViewLog,
  onDownload,
}: {
  rec: RunSummary;
  onClear: () => void;
  onSelectLayer: (layerId: string) => void;
  onSelectNone: () => void;
  onOpacityChange: (opacity: number) => void;
  onViewLog?: () => void;
  onDownload?: () => void;
}) {
  const canShow = rec.status === 'succeeded' && rec.layerIds.length > 0;
  const [expanded, setExpanded] = useState(false);
  const [logExpanded, setLogExpanded] = useState(false);
  const hasWarnings = rec.warnings.length > 0;
  const hasLog = rec.log.length > 0;

  const radioName = `layer-${rec.runId}`;
  const noneSelected = rec.visibleLayerIds.length === 0;
  // All layers of a run share an opacity (set via the per-run slider).
  const runOpacity = rec.layerOpacities[rec.layerIds[0] ?? ''] ?? 1;

  return (
    <li className={`run-item run-item--${rec.status}${rec.visible ? ' run-item--visible' : ''}`}>
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
        {canShow && onDownload && (
          <button
            type="button"
            className="btn btn-ghost run-item__download"
            onClick={onDownload}
            title="Download result layers"
          >
            Download
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
      {canShow && (
        <div className="run-item__opacity">
          <span className="run-item__opacity-label">Opacity</span>
          <div className="range-field">
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={runOpacity}
              aria-label="Layer opacity"
              onChange={(e) => onOpacityChange(Number(e.target.value))}
            />
            <span className="range-value">{Math.round(runOpacity * 100)}%</span>
          </div>
        </div>
      )}
      {canShow && expanded && (
        <ul className="run-item__layers">
          <li className="run-item__layer">
            <label className="run-item__layer-label">
              <input
                type="radio"
                name={radioName}
                checked={noneSelected}
                onChange={onSelectNone}
              />
              <span className="run-item__layer-id">None</span>
            </label>
          </li>
          {rec.layerIds.map((layerId) => {
            const checked = rec.visibleLayerIds.length === 1 && rec.visibleLayerIds[0] === layerId;
            return (
              <li key={layerId} className="run-item__layer">
                <label className="run-item__layer-label">
                  <input
                    type="radio"
                    name={radioName}
                    checked={checked}
                    onChange={() => onSelectLayer(layerId)}
                  />
                  <span className="run-item__layer-id">{rec.layerNames?.[layerId] ?? layerId}</span>
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
  onViewLog?: (runId: string, log: RunLogEntry[]) => void;
  onDownload?: (runId: string) => void;
}

export function ResultsPanel({ className = 'results-panel', onViewLog, onDownload }: ResultsPanelProps) {
  const { summaries, selectResultLayer, hideResult, setRunOpacity, clearResult, clearAll } = useResults();
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
              onSelectLayer={(layerId) => selectResultLayer(r.runId, layerId)}
              onSelectNone={() => hideResult(r.runId)}
              onOpacityChange={(opacity) => setRunOpacity(r.runId, opacity)}
              onClear={() => clearResult(r.runId)}
              onViewLog={onViewLog ? () => onViewLog(r.runId, r.log) : undefined}
              onDownload={onDownload ? () => onDownload(r.runId) : undefined}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
