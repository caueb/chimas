export interface SnafflerEntry {
  time: string;
  level: string;
  message: string;
  eventProperties: Record<string, unknown>;
}

export interface SnafflerJsonData {
  entries: SnafflerEntry[];
}

// Re-export RiskScore types from riskScoring utility
export type { RiskScore, RiskFactor } from './utils/riskScoring';

export interface FileResult {
  rating: 'Red' | 'Green' | 'Yellow' | 'Black';
  fullPath: string;
  fileName: string;
  creationTime: string;
  lastModified: string;
  size: string;
  matchContext: string;
  ruleName: string;
  matchedStrings: string[];
  triage: string;
  userContext?: string; // Optional field for user context from text logs
  rwStatus?: {
    readable: boolean;
    writable: boolean;
    modifyable: boolean;
  };
  isFalsePositive?: boolean; // Track if this item is marked as false positive
  riskScore?: import('./utils/riskScoring').RiskScore; // Calculated risk score
}

export interface ShareResult {
  rating: 'Red' | 'Green' | 'Yellow' | 'Black';
  sharePath: string;
  shareName: string;
  systemId: string;
  shareComment: string;
  listable: boolean;
  rootWritable: boolean;
  rootReadable: boolean;
  rootModifyable: boolean;
  snaffle: boolean;
  scanShare: boolean;
  triage: string;
  userContext?: string; // Optional field for user context from text logs
}

export interface Stats {
  total: number;
  red: number;
  green: number;
  yellow: number;
  black: number;
}

export interface CustomFilter {
  id: string;
  text: string;
}

export type SortField = 'rating' | 'fullPath' | 'creationTime' | 'lastModified' | 'size' | 'riskScore';
export type SortDirection = 'asc' | 'desc';

// Duplicate detection statistics from parser
export interface DuplicateStats {
  totalOriginal: number;
  totalFinal: number;
  duplicatesRemoved: number;
  duplicatePercentage: number;
}

// Error information for file parsing errors
export interface ErrorInfo {
  message: string;
  snippet?: string;
  errorPosition?: number;
  fileName?: string;
  fileType?: 'json' | 'text' | 'log';
  actualLineNumber?: number;
  snippetStartLine?: number;
}

// Column visibility configuration for results table
export interface VisibleColumns {
  rating: boolean;
  fullPath: boolean;
  creationTime: boolean;
  lastModified: boolean;
  size: boolean;
}

// GPO sort field types
export type GPODetailsSortField = 'gpo' | 'settingsCount' | 'linked';
export type GPOResultsSortField = 'gpo' | 'scope' | 'category' | 'entries' | 'findings' | 'severity';

// GPO sorting value union type
export type GPOSortValue = string | number | boolean | string[] | undefined;

// Re-export GPO types from GPOParser for convenience
export type { Gpo, GPOReport, GpoHeader, SettingBlock, Finding } from './utils/GPOParser';

// Share info type for processed share data
export interface ShareInfo {
  systemId: string;
  shareName: string;
  path: string;
  permissions: string;
  fileCount: number;
  shareComment: string;
  listable: boolean;
  rootReadable: boolean;
  rootWritable: boolean;
  rootModifyable: boolean;
  snaffle: boolean;
  scanShare: boolean;
  rating: string;
}