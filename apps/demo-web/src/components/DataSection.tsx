import { useDraw, useDataSources } from '@catshark/react';

function FeatureCard({ id }: { id: string }) {
  const { state, dispatch, removeFeature, toggleVisibility } = useDraw();
  const feature = state.features.find((f) => f.id === id);

  if (!feature) return null;

  const kindIcon = feature.geometryKind === 'point' ? '◉'
    : feature.geometryKind === 'linestring' ? '〰'
    : '⬡';

  return (
    <div
      className={`data-feature-item ${state.selectedFeatureId === feature.id ? 'selected' : ''}`}
      onClick={() => dispatch({ type: 'SELECT_FEATURE', payload: feature.id })}
    >
      <div className="data-feature-row">
        <span className="data-feature-dot" title={feature.geometryKind}>{kindIcon}</span>
        <input
          type="text"
          className="data-feature-type"
          value={feature.category}
          placeholder="Category"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => dispatch({ type: 'UPDATE_FEATURE', payload: { id: feature.id, updates: { category: e.target.value } } })}
          title="Free-text category label"
        />
        <input
          type="text"
          className="data-feature-label"
          value={feature.label}
          placeholder="Label..."
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => dispatch({ type: 'UPDATE_FEATURE', payload: { id: feature.id, updates: { label: e.target.value } } })}
        />
        <button
          className="data-icon-btn"
          onClick={(e) => { e.stopPropagation(); toggleVisibility(feature.id); }}
          title={feature.visible ? 'Hide' : 'Show'}
        >
          {feature.visible ? '👁' : '∅'}
        </button>
        <button
          className="data-icon-btn data-icon-btn--danger"
          onClick={(e) => { e.stopPropagation(); removeFeature(feature.id); }}
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

export function DataSection() {
  const { sources } = useDataSources();
  const { state } = useDraw();

  return (
    <div className="data-section">
      {sources.map((source) => {
        const features = state.features.filter((f) => source.featureIds.includes(f.id));
        return (
          <div key={source.id} className="data-source-block">
            <div className="data-source-header">
              <span className="data-source-name">{source.name}</span>
              <span className="data-source-kind">{source.kind}</span>
            </div>
            {features.length === 0 ? (
              <p className="hint">No features in this source yet. Use the toolbar above the map to draw.</p>
            ) : (
              <div className="data-feature-list">
                {features.map((f) => <FeatureCard key={f.id} id={f.id} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}