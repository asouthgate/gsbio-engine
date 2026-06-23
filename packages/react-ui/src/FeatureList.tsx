import { useState } from 'react';
import { useDraw, useDataSources } from '@gsbio/react';
import type { CircleGeometry, DataSourceDef, DrawnFeature, LngLat } from '@gsbio/core';

/* ----------------------------------------------------------------------- */
/* Geometry-coordinate helpers (pure, view-only extractions from GeoJSON) */
/* ----------------------------------------------------------------------- */

type Coords2 = [number, number];
type Coords3 = number[][];

function pointCoords(f: DrawnFeature): LngLat | null {
  const g = f.geojson.geometry as { coordinates: Coords2 };
  return Array.isArray(g.coordinates) && g.coordinates.length >= 2
    ? { lng: g.coordinates[0], lat: g.coordinates[1] }
    : null;
}

function lineStringCoords(f: DrawnFeature): LngLat[] {
  const g = f.geojson.geometry as { coordinates: Coords2[] };
  return g.coordinates.map(([lng, lat]) => ({ lng, lat }));
}

/** Outer ring, with the closing duplicate vertex stripped for display. */
function polygonRing(f: DrawnFeature): LngLat[] {
  const g = f.geojson.geometry as { coordinates: Coords3[] };
  const ring = g.coordinates[0] ?? [];
  if (ring.length > 1) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      return ring.slice(0, -1).map(([lng, lat]) => ({ lng, lat }));
    }
  }
  return ring.map(([lng, lat]) => ({ lng, lat }));
}

/* ----------------------------------------------------------------------- */
/* Per-kind field editors                                                  */
/* ----------------------------------------------------------------------- */

interface FieldsProps {
  feature: DrawnFeature;
}

function PointFields({ feature }: FieldsProps) {
  const { updatePointPosition } = useDraw();
  const c = pointCoords(feature) ?? { lng: 0, lat: 0 };
  const set = (key: 'lng' | 'lat', v: number) =>
    updatePointPosition(feature.id, { ...c, [key]: v } as LngLat);
  return (
    <div className="data-feature-fields">
      <label className="data-prop">
        <span className="data-prop-label">lng</span>
        <input
          type="number"
          className="data-vertex-input"
          step="any"
          value={c.lng}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => set('lng', Number(e.target.value))}
        />
      </label>
      <label className="data-prop">
        <span className="data-prop-label">lat</span>
        <input
          type="number"
          className="data-vertex-input"
          step="any"
          value={c.lat}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => set('lat', Number(e.target.value))}
        />
      </label>
    </div>
  );
}

function CircleFields({ feature }: FieldsProps) {
  const { updateCircle } = useDraw();
  const circle: CircleGeometry = feature.circle ?? { center: { lng: 0, lat: 0 }, radiusMeters: 0 };
  const setCenter = (key: 'lng' | 'lat', v: number) =>
    updateCircle(feature.id, { center: { ...circle.center, [key]: v } });
  return (
    <div className="data-feature-fields">
      <label className="data-prop">
        <span className="data-prop-label">center lng</span>
        <input
          type="number"
          className="data-vertex-input"
          step="any"
          value={circle.center.lng}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setCenter('lng', Number(e.target.value))}
        />
      </label>
      <label className="data-prop">
        <span className="data-prop-label">center lat</span>
        <input
          type="number"
          className="data-vertex-input"
          step="any"
          value={circle.center.lat}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setCenter('lat', Number(e.target.value))}
        />
      </label>
      <label className="data-prop">
        <span className="data-prop-label">radius (m)</span>
        <input
          type="number"
          className="data-vertex-input"
          min={1}
          step="any"
          value={circle.radiusMeters}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => updateCircle(feature.id, { radiusMeters: Number(e.target.value) })}
        />
      </label>
    </div>
  );
}

interface VertexListFieldsProps {
  coords: LngLat[];
  onCoordsChange: (coords: LngLat[]) => void;
  /** Hide the closing-duplicate vertex for polygons. */
  isRing?: boolean;
}

function VertexListFields({ coords, onCoordsChange, isRing }: VertexListFieldsProps) {
  const update = (i: number, key: 'lng' | 'lat', v: number) => {
    const next = coords.map((c, j) => (j === i ? { ...c, [key]: v } : c));
    onCoordsChange(next);
  };
  const remove = (i: number) => {
    // rings need >= 3 vertices to remain a valid polygon; linestrings >= 2.
    const min = isRing ? 3 : 2;
    if (coords.length <= min) return;
    onCoordsChange(coords.filter((_, j) => j !== i));
  };
  const add = () => {
    const last = coords[coords.length - 1] ?? { lng: 0, lat: 0 };
    onCoordsChange([...coords, { ...last }]);
  };

  return (
    <div className="data-feature-fields">
      <div className="data-vertex-list">
        {coords.map((c, i) => (
          <div className="data-vertex-row" key={i}>
            <span className="data-vertex-index">{i + 1}</span>
            <input
              type="number"
              className="data-vertex-input"
              step="any"
              value={c.lng}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => update(i, 'lng', Number(e.target.value))}
              title="Longitude"
            />
            <input
              type="number"
              className="data-vertex-input"
              step="any"
              value={c.lat}
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => update(i, 'lat', Number(e.target.value))}
              title="Latitude"
            />
            <button
              className="data-icon-btn data-vertex-remove"
              onClick={(e) => { e.stopPropagation(); remove(i); }}
              title="Remove vertex"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        className="data-vertex-add"
        onClick={(e) => { e.stopPropagation(); add(); }}
        title="Append vertex"
      >
        + vertex
      </button>
    </div>
  );
}

function LineStringFields({ feature }: FieldsProps) {
  const { updateLineStringCoords } = useDraw();
  const coords = lineStringCoords(feature);
  return (
    <VertexListFields
      coords={coords}
      onCoordsChange={(next) => updateLineStringCoords(feature.id, next)}
    />
  );
}

function PolygonFields({ feature }: FieldsProps) {
  const { updatePolygonRing } = useDraw();
  const ring = polygonRing(feature);
  return (
    <VertexListFields
      coords={ring}
      isRing
      onCoordsChange={(next) => updatePolygonRing(feature.id, next)}
    />
  );
}

function GeometryFields({ feature }: FieldsProps) {
  switch (feature.geometryKind) {
    case 'point': return <PointFields feature={feature} />;
    case 'circle': return <CircleFields feature={feature} />;
    case 'linestring': return <LineStringFields feature={feature} />;
    case 'polygon': return <PolygonFields feature={feature} />;
  }
}

/* ----------------------------------------------------------------------- */
/* Feature card with collapsible geometry inspector                         */
/* ----------------------------------------------------------------------- */

function FeatureCard({ id }: { id: string }) {
  const { state, dispatch, removeFeature, toggleVisibility } = useDraw();
  const [open, setOpen] = useState(false);
  const feature = state.features.find((f) => f.id === id);

  if (!feature) return null;

  const kindIcon = feature.geometryKind === 'point' ? '◉'
    : feature.geometryKind === 'linestring' ? '〰'
    : feature.geometryKind === 'polygon' ? '⬡'
    : '○';

  return (
    <div
      className={`data-feature-item ${state.selectedFeatureId === feature.id ? 'selected' : ''}`}
      onClick={() => dispatch({ type: 'SELECT_FEATURE', payload: feature.id })}
    >
      <div className="data-feature-row">
        <span className="data-feature-dot" title={feature.geometryKind}>{kindIcon}</span>
        <span
          className="data-feature-type"
          title="Category (set by tool, not editable)"
        >
          {feature.category}
        </span>
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
        <button
          className="data-icon-btn data-feature-disclosure"
          onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
          aria-expanded={open}
          title={open ? 'Collapse geometry' : 'Expand geometry'}
        >
          {open ? '▾' : '▸'}
        </button>
      </div>
      {open && <GeometryFields feature={feature} />}
    </div>
  );
}

function SourceBlock({ source }: { source: DataSourceDef }) {
  const { state } = useDraw();
  const features = state.features.filter((f) => source.featureIds.includes(f.id));
  return (
    <div className="data-source-block">
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
}

export interface FeatureListProps {
  className?: string;
}

export function FeatureList({ className = 'data-section' }: FeatureListProps) {
  const { sources } = useDataSources();
  return (
    <div className={className}>
      {sources.map((source) => <SourceBlock key={source.id} source={source} />)}
    </div>
  );
}