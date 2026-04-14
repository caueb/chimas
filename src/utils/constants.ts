/**
 * Centralized constants for the Chimas application
 * Consolidates values previously scattered across App.tsx, GPODetails.tsx, GPOResults.tsx
 */

// Panel layout constraints (previously repeated 10+ times across components)
export const LAYOUT = {
  MIN_LEFT_PANEL: 180,
  MIN_RIGHT_PANEL: 280,
  MIN_CENTER_PANEL: 480,
  DEFAULT_LEFT_PANEL: 300,
  DEFAULT_RIGHT_PANEL: 400,
  MINIMIZED_PANEL: 50,
} as const;

// LocalStorage keys for persistence
export const STORAGE_KEYS = {
  // File results view
  LEFT_PANEL_PCT: 'layout:leftPct',
  RIGHT_PANEL_PCT: 'layout:rightPct',

  // GPO results view
  GPO_LEFT_PANEL_PCT: 'layout:gpo:leftPct',
  GPO_RIGHT_PANEL_PCT: 'layout:gpo:rightPct',

  // GPO details view
  GPO_DETAILS_LEFT_PCT: 'layout:gpo-details:leftPct',
  GPO_DETAILS_RIGHT_PCT: 'layout:gpo-details:rightPct',

  // Scroll positions
  GPO_LIST_SCROLL: 'scroll:gpo-list',
  GPO_SETTINGS_SCROLL: 'scroll:gpo-settings',
} as const;

// Credentials keywords for filtering (from App.tsx:28-33)
export const CREDENTIALS_KEYWORDS = [
  'password',
  'pass',
  'p@ss',
  'pwd',
  'p@$$w0rd',
  'passwd',
  'passcode',
  'passphrase',
  'credentials',
  'creds',
  '$cred',
  'cred',
  'login',
  'authtoken',
  'accesskey',
  'apikey',
  'secret',
  'secrettoken',
  'securestring',
  '-asstring',
  'vaultpass',
  'rootpass',
  'adminpass',
  'dbpass',
  'dbuser',
  'dbadmin',
  'dbcred',
  'authpass',
  'masterkey',
  'clientsecret',
] as const;

// Snaffler strings that indicate credentials or secrets e.g. HasPassword,LookNearbyFor.txtFiles
export const SNAFF_CREDS_KEYWORDS = [
  'HasPassword', 'LookNearbyFor.txtFiles'
] as const;

// Rating severity order for sorting (Black is most severe)
export const RATING_ORDER: Record<string, number> = {
  Black: 4,
  Red: 3,
  Yellow: 2,
  Green: 1,
} as const;

// Pagination defaults
export const PAGINATION = {
  DEFAULT_PAGE_SIZE: 100,
  PAGE_SIZE_OPTIONS: [50, 100, 200, 500, 1000] as const,
  GPO_PAGE_SIZE_OPTIONS: [25, 50, 100] as const,
} as const;

// View types
export type View =
  | 'dashboard'
  | 'file-results'
  | 'share-results'
  | 'GPO-results'
  | 'GPO-details'
  | 'misconfigurations';

// Severity types for misconfiguration findings
// 'info' = properly configured (for coverage verification via BloodHound)
export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export const SEVERITY_COLORS: Record<Severity, { badge: string; text: string }> = {
  critical: { badge: '#dc2626', text: '#ffffff' },
  high: { badge: '#ea580c', text: '#ffffff' },
  medium: { badge: '#ca8a04', text: '#000000' },
  low: { badge: '#2563eb', text: '#ffffff' },
  info: { badge: '#22c55e', text: '#ffffff' },  // Green for properly configured
};

export const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};
