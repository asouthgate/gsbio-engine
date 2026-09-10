import type { ModelParamDef } from '../core';

/**
 * Renders a single model parameter field from its declarative schema.
 *
 * Supports `number`, `range`, `select`, and `boolean` param types. Apps compose
 * their own layouts (grouping, banners, subtext) around this primitive.
 */
export interface ParamFieldProps {
  def: ModelParamDef;
  value: number;
  onChange: (value: number) => void;
}

export function ParamField({ def, value, onChange }: ParamFieldProps) {
  if (def.type === 'select') {
    return (
      <label className="field">
        <span className="field-label">{def.label}</span>
        <select value={value} onChange={(e) => onChange(Number(e.target.value))}>
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
          checked={value === 1}
          onChange={(e) => onChange(e.target.checked ? 1 : 0)}
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
            value={value}
            onChange={(e) => onChange(Number(e.target.value))}
          />
          <span className="range-value">{value}</span>
        </div>
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
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
