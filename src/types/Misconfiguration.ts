import { Severity } from '../utils/constants';
import { ValueDefinition } from '../utils/valueDefinitions';

export type MisconfigScope = 'all-computers' | 'domain-controllers';

export type CheckStatus =
  | 'insecure'          // At least one GPO sets an insecure value
  | 'mixed'             // Both secure and insecure GPO values present
  | 'not_in_gpo'        // No GPO configures this; Windows default may apply
  | 'hardened'          // Only secure values observed in GPOs
  | 'partial_coverage'; // Secure GPOs exist but BH shows uncovered hosts

export type SecurityCategory =
  | 'smb'
  | 'name-resolution'
  | 'ntlm'
  | 'ldap'
  | 'credentials'
  | 'network';

export const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  insecure: 'Insecure GPO',
  mixed: 'Mixed Values',
  not_in_gpo: 'Not in GPO',
  hardened: 'Hardened',
  partial_coverage: 'Coverage Gap',
};

export const SECURITY_CATEGORY_LABELS: Record<SecurityCategory, string> = {
  smb: 'SMB',
  'name-resolution': 'Name Resolution',
  ntlm: 'NTLM',
  ldap: 'LDAP',
  credentials: 'Credentials',
  network: 'Network',
};

export const ISSUE_STATUSES: CheckStatus[] = [
  'insecure',
  'mixed',
  'not_in_gpo',
  'partial_coverage',
];

export interface WindowsDefaultInfo {
  valueLabel: string;
  isInsecure: boolean;
  notes?: string;
}

export interface Misconfiguration {
  id: string;
  name: string;
  description: string;
  abuseSummary: string;
  verdict: string;
  severity: Severity;
  status: CheckStatus;
  category: SecurityCategory;
  registryPath: string;
  recommendedValue: string;
  policyPath?: string;
  windowsDefault: WindowsDefaultInfo;
  gpoCount: number;
    gposByValue: Record<string, string[]>;
  possibleValues?: ValueDefinition[];
  scope?: MisconfigScope;
}

export interface MisconfigurationState {
  selectedIndex: number | null;
  sortField: 'name' | 'severity' | 'gpoCount' | 'status' | 'category';
  sortDirection: 'asc' | 'desc';
  currentPage: number;
  pageSize: number;
  issuesOnly: boolean;
  search: string;
  statusFilter: CheckStatus[];
  severityFilter: Severity[];
  categoryFilter: SecurityCategory | 'all';
  scopeFilter: MisconfigScope | 'all';
}
