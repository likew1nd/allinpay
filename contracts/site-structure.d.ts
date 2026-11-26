export type StructureValidationReason = 'MATCHED' | 'MISSING_TABLES_OR_COLUMNS' | 'AMBIGUOUS_PREFIX' | 'NO_MATCH';

export interface StructureValidation {
  mappingVersion: string;
  tablePrefix?: string;
  candidatePrefixes: string[];
  reason: StructureValidationReason;
  checks: Array<{ table: string; exists: boolean; requiredColumns: string[]; missingColumns: string[] }>;
}

export interface StructureReport {
  database: string;
  tables: Array<{ name: string; columns?: string[] }>;
  candidates: string[];
  checkedAt: string;
  siteVersion?: string;
  validation?: StructureValidation;
}
