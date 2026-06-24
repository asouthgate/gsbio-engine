import { useEffect, useRef, useState } from 'react';
import { useResults } from '@gsbio/engine';
import type { RunLogEntry } from '@gsbio/engine';
import { CollapsibleSection } from './CollapsibleSection';
import { FeatureList, ModelForm, RunPanel, ResultsPanel } from '@gsbio/engine';
import { RunLogModal } from './RunLogModal';

interface SectionDef {
  id: string;
  icon: string;
  label: string;
  defaultOpen?: boolean;
}

const SECTIONS: SectionDef[] = [
  { id: 'data', icon: '🗎', label: 'Data', defaultOpen: true },
  { id: 'model', icon: '⚙', label: 'Model', defaultOpen: true },
  { id: 'results', icon: '✓', label: 'Results' },
  { id: 'help', icon: 'ⓘ', label: 'Help' },
];

function HelpContent() {
  return (
    <div className="help-content">
      <p><b>gsbio Engine</b> performs biological spatial modelling on maps (or other manifolds).</p>
      <p><b>To draw</b> features, use the toolbar above the map: point, line, or polygon. Each drawn feature becomes part of the <i>Drawn features</i> data source, listed in the Data section.</p>
      <p><b>To configure a model</b>, open the Model section, choose a registered model, and adjust its parameters.</p>
      <p><b>To run</b>, click <b>Run model</b> in the Model section. Runs are cancellable. Completed runs appear in the Results section where you can toggle their map layer on/off.</p>
      <p>This is an open-source engine. Bugs? <a href="https://github.com/js01/dispersion-prediction-app/issues" target="_blank" rel="noopener noreferrer">Report on GitHub</a>.</p>
    </div>
  );
}

export function SidePanel() {
  const [collapsed, setCollapsed] = useState(false);
  const [openSections, setOpenSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    for (const s of SECTIONS) if (s.defaultOpen) initial.add(s.id);
    return initial;
  });
  const [logRunId, setLogRunId] = useState<string | null>(null);
  const { summaries } = useResults();
  const logRun = logRunId ? summaries.find((s) => s.runId === logRunId) ?? null : null;

  // Auto-expand the Results section the first time a run completes (or fails),
  // so the user doesn't have to hunt for the panel after `Run model`. We track
  // the highest count of "finished" runs we've seen and only pop on a net-new
  // one so re-renders after toggles don't reopen it.
  const seenFinished = useRef(0);
  useEffect(() => {
    const finished = summaries.filter(
      (s) => s.status === 'succeeded' || s.status === 'failed' || s.status === 'cancelled',
    ).length;
    if (finished > seenFinished.current) {
      seenFinished.current = finished;
      setOpenSections((prev) => prev.has('results') ? prev : new Set(prev).add('results'));
    }
  }, [summaries]);

  const toggle = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleViewLog = (runId: string, _log: RunLogEntry[]): void => {
    void _log;
    setLogRunId(runId);
  };

  const renderBody = (id: string) => {
    if (id === 'data') return <FeatureList />;
    if (id === 'model') return (<><ModelForm /><RunPanel /></>);
    if (id === 'results') return <ResultsPanel onViewLog={handleViewLog} />;
    if (id === 'help') return <HelpContent />;
    return null;
  };

  const modal = (
    <RunLogModal run={logRun} onClose={() => setLogRunId(null)} />
  );

  if (collapsed) {
    return (
      <>
        <div className="side-panel side-panel--collapsed">
          <button className="panel-expand-btn" onClick={() => setCollapsed(false)} title="Expand panel">
            ◀
          </button>
          <nav className="panel-icon-rail">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                className={`panel-icon-btn ${openSections.has(s.id) ? 'active' : ''}`}
                onClick={() => {
                  setCollapsed(false);
                  setOpenSections((prev) => new Set(prev).add(s.id));
                }}
                title={s.label}
              >
                {s.icon}
              </button>
            ))}
          </nav>
        </div>
        {modal}
      </>
    );
  }

  return (
    <>
      <div className="side-panel">
        <div className="side-panel-top-row">
          <span className="side-panel-title">gsbio engine</span>
          <button className="panel-collapse-btn" onClick={() => setCollapsed(true)} title="Collapse panel">
            ▶
          </button>
        </div>
        <div className="side-panel-scroll">
          {SECTIONS.map((s) => (
            <CollapsibleSection
              key={s.id}
              title={s.label}
              icon={s.icon}
              open={openSections.has(s.id)}
              onToggle={() => toggle(s.id)}
            >
              {renderBody(s.id)}
            </CollapsibleSection>
          ))}
        </div>
      </div>
      {modal}
    </>
  );
}