import { useState } from 'react';
import { CollapsibleSection } from './CollapsibleSection';
import { FeatureList, ModelForm, RunPanel, ResultsPanel } from '@catshark/react-ui';

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
      <p><b>Catshark Engine</b> performs biological spatial modelling on maps (or other manifolds).</p>
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

  const toggle = (id: string) => {
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderBody = (id: string) => {
    if (id === 'data') return <FeatureList />;
    if (id === 'model') return (<><ModelForm /><RunPanel /></>);
    if (id === 'results') return <ResultsPanel />;
    if (id === 'help') return <HelpContent />;
    return null;
  };

  if (collapsed) {
    return (
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
    );
  }

  return (
    <div className="side-panel">
      <div className="side-panel-top-row">
        <span className="side-panel-title">Catshark Engine</span>
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
  );
}