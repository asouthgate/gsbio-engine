/**
 * Declarative schema for a single editable field on a feature's `data` bag.
 *
 * The engine does not interpret the field's meaning. It only renders the
 * input declared by the app and reads/writes `feature.data[key]`.
 */
export interface DataFieldDef {
  /** Key into `DataFeature.data`. */
  key: string;
  label: string;
  type?: 'number' | 'range' | 'select' | 'boolean' | 'text';
  min?: number;
  max?: number;
  step?: number;
  options?: { value: number; label: string }[];
}

export interface DataFieldProps {
  def: DataFieldDef;
  value: unknown;
  onChange: (value: unknown) => void;
}

/** Renders a single feature-data field from its `DataFieldDef` schema. */
export function DataField({ def, value, onChange }: DataFieldProps) {
  if (def.type === 'select') {
    return (
      <label className="field">
        <span className="field-label">{def.label}</span>
        <select value={Number(value ?? 0)} onChange={(e) => onChange(Number(e.target.value))}>
          {(def.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>{o.label}</option>
          ))}
        </select>
      </label>
    );
  }

  if (def.type === 'boolean') {
    return (
      <label className="field field--inline">
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onChange(e.target.checked)}
        />
        <span className="field-label">{def.label}</span>
      </label>
    );
  }

  if (def.type === 'range') {
    return (
      <label className="field">
        <span className="field-label">{def.label}</span>
        <div className="range-field">
          <input
            type="range"
            min={def.min}
            max={def.max}
            step={def.step ?? 1}
            value={Number(value ?? 0)}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span className="range-value">{Number(value ?? 0)}</span>
        </div>
      </label>
    );
  }

  if (def.type === 'text') {
    return (
      <label className="field">
        <span className="field-label">{def.label}</span>
        <input
          type="text"
          value={String(value ?? '')}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    );
  }

  return (
    <label className="field">
      <span className="field-label">{def.label}</span>
      <input
        type="number"
        min={def.min}
        max={def.max}
        step={def.step ?? 1}
        value={value == null ? '' : Number(value)}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
