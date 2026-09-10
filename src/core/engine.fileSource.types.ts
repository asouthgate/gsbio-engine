export interface FileSourceDef {
  id: string;
  name: string;
  category: string;
}

/** A non-geospatial source of arbitrary data (e.g. CSV text, JSON) keyed by id. */
export interface RawSource {
  id: string;
  name: string;
  data: unknown;
}
