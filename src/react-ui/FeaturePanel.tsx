import type { ReactNode } from 'react';
import { useFeatures } from '../react';
import type { DataFeature } from '../core';
import { DataField, type DataFieldDef } from './DataField';

const kindIconFallback: Record<string, string> = {
  point: '◉',
  multipoint: '◉',
  linestring: '〰',
  polygon: '⬡',
  circle: '○',
};

export interface FeaturePanelProps {
  className?: string;
  /** Resolve the editable data fields for a feature (empty/[] = no fields). */
  dataFields?: (feature: DataFeature) => DataFieldDef[];
  /** Injected icons (fall back to unicode glyphs). */
  icons?: { show?: ReactNode; hide?: ReactNode; delete?: ReactNode };
  /** Render a category icon (falls back to a geometry-kind glyph). */
  renderCategoryIcon?: (feature: DataFeature) => ReactNode;
  /** Escape hatch for domain-specific extras (e.g. raster info, point counts). */
  renderExtra?: (feature: DataFeature) => ReactNode;
}

function FeatureCard({
  feature,
  selected,
  dataFields,
  icons,
  renderCategoryIcon,
  renderExtra,
  onSelect,
  onUpdateData,
  onLabelChange,
  onToggleVisibility,
  onDelete,
}: {
  feature: DataFeature;
  selected: boolean;
  dataFields?: (feature: DataFeature) => DataFieldDef[];
  icons?: FeaturePanelProps['icons'];
  renderCategoryIcon?: (feature: DataFeature) => ReactNode;
  renderExtra?: (feature: DataFeature) => ReactNode;
  onSelect: () => void;
  onUpdateData: (key: string, value: unknown) => void;
  onLabelChange: (label: string) => void;
  onToggleVisibility: () => void;
  onDelete: () => void;
}) {
  const fields = dataFields ? dataFields(feature) : [];

  return (
    <div className={`data-feature-item ${selected ? 'selected' : ''}`} onClick={onSelect}>
      <div className="data-feature-row">
        {renderCategoryIcon
          ? renderCategoryIcon(feature)
          : <span className="data-feature-dot">{kindIconFallback[feature.geometryKind] ?? '○'}</span>}
        <span className="data-feature-type">{feature.category}</span>
        <input
          type="text"
          className="data-feature-label"
          value={feature.label}
          placeholder="Label..."
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => onLabelChange(e.target.value)}
        />
        <button
          className="data-icon-btn"
          onClick={(e) => { e.stopPropagation(); onToggleVisibility(); }}
          title={feature.visible ? 'Hide' : 'Show'}
        >
          {feature.visible ? (icons?.show ?? '👁') : (icons?.hide ?? '∅')}
        </button>
        <button
          className="data-icon-btn data-icon-btn--danger"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          title="Delete"
        >
          {icons?.delete ?? '✕'}
        </button>
      </div>

      {fields.length > 0 && (
        <div className="feature-card-extra">
          {fields.map((def) => (
            <DataField
              key={def.key}
              def={def}
              value={feature.data?.[def.key]}
              onChange={(v) => onUpdateData(def.key, v)}
            />
          ))}
        </div>
      )}

      {renderExtra ? renderExtra(feature) : null}
    </div>
  );
}

/**
 * Generic feature inspector: lists features with label editing, a visibility
 * toggle, delete, and app-declared data fields. The engine stays model-agnostic.
 * the app supplies the field schema, icons, and any domain-specific extras.
 */
export function FeaturePanel({
  className = 'data-feature-list',
  dataFields,
  icons,
  renderCategoryIcon,
  renderExtra,
}: FeaturePanelProps) {
  const { state, selectFeature, updateFeature, toggleVisibility, removeFeature } = useFeatures();
  const features = state.features;

  if (features.length === 0) return null;

  return (
    <div className={className}>
      {features.map((f) => (
        <FeatureCard
          key={f.id}
          feature={f}
          selected={state.selectedFeatureId === f.id}
          dataFields={dataFields}
          icons={icons}
          renderCategoryIcon={renderCategoryIcon}
          renderExtra={renderExtra}
          onSelect={() => selectFeature(f.id)}
          onUpdateData={(key, value) => updateFeature(f.id, { data: { ...(f.data ?? {}), [key]: value } })}
          onLabelChange={(label) => updateFeature(f.id, { label })}
          onToggleVisibility={() => toggleVisibility(f.id)}
          onDelete={() => removeFeature(f.id)}
        />
      ))}
    </div>
  );
}
