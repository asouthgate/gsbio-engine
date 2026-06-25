export type FileFormat = 'csv' | 'geojson';

export interface CsvColumnMapping {
  xColumn: string;
  yColumn: string;
  propertyColumns?: string[];
}

export interface FileSourceDef {
  id: string;
  name: string;
  format: FileFormat;
  sourceCrs?: string;
  targetCrs?: string;
  csvMapping?: CsvColumnMapping;
  category: string;
}
