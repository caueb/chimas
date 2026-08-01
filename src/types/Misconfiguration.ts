import { Severity } from '../utils/constants';
import { ValueDefinition } from '../utils/valueDefinitions';

export type MisconfigScope = 'all-computers' | 'domain-controllers';

export interface Misconfiguration {
  id: string;
  name: string;
  description: string;
  severity: Severity;
  registryPath: string;
  recommendedValue: string;
  gpoCount: number;
  // GPOs grouped by their configured value
  // Key: value string (e.g., "0", "1", "5", "0x20080000", "(Default)")
  // Value: array of GPO names configuring that value
  gposByValue: Record<string, string[]>;
  // Possible values for this registry setting (from valueDefinitions.ts)
  possibleValues?: ValueDefinition[];
  // Whether this setting applies to all computers or only domain controllers
  scope?: MisconfigScope;
}

export interface MisconfigurationState {
  selectedIndex: number | null;
  sortField: 'name' | 'severity' | 'gpoCount';
  sortDirection: 'asc' | 'desc';
  currentPage: number;
  pageSize: number;
}
