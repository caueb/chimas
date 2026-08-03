import { GPOReport, Gpo, SettingBlock } from './GPOParser';
import {
  Misconfiguration,
  MisconfigScope,
  CheckStatus,
} from '../types/Misconfiguration';
import { Severity } from './constants';
import {
  getSecurityCheck,
  normalizeValueKey,
  isSecureValue,
  getValueLabel,
  SecurityCheckDefinition,
} from './valueDefinitions';

/**
 * Group3r wraps long table cells with a trailing "-" then continues on the next
 * row, which coalesceKVRows joins as "Paramete- rs". Normalize wrap artifacts
 * only — do not strip legitimate spaces (e.g. "Windows NT").
 */
export function normalizeRegistryPath(path: string): string {
  return path
    .replace(/-\s*/g, '')
    .trim();
}

export function findRegistryEntries(
  report: GPOReport,
  pathPattern: RegExp,
  valueName?: string
): Array<{ gpo: Gpo; setting: SettingBlock; value: string | null }> {
  const results: Array<{ gpo: Gpo; setting: SettingBlock; value: string | null }> = [];

  for (const gpo of report.gpos) {
    for (const setting of gpo.settings) {
      if (setting.category?.toLowerCase() !== 'registry') continue;

      const registryPath = normalizeRegistryPath(setting.entries['Key'] || '');
      if (!pathPattern.test(registryPath)) continue;

      if (valueName) {
        const entryValueName = setting.entries['Value Name'] || '';
        if (!entryValueName.toLowerCase().includes(valueName.toLowerCase())) continue;
      }

      const value = setting.entries['Value String'] || setting.entries['Value'] || null;
      results.push({ gpo, setting, value });
    }
  }

  return results;
}

export function parseRegistryValue(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim().replace(/^["']|["']$/g, '');
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    const n = parseInt(trimmed, 16);
    return isNaN(n) ? null : n;
  }
  const num = parseInt(trimmed, 10);
  return isNaN(num) ? null : num;
}

function collectGposByValue(
  entries: Array<{ gpo: Gpo; value: string | null }>,
  options?: {
    formatKey?: (raw: string | null, num: number | null) => string | null;
  }
): Record<string, string[]> {
  const gposByValue: Record<string, string[]> = {};

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    let key: string | null;

    if (options?.formatKey) {
      const num = parseRegistryValue(value);
      key = options.formatKey(value, num);
    } else {
      key = normalizeValueKey(value);
    }

    if (key === null) continue;
    if (!gposByValue[key]) gposByValue[key] = [];
    if (!gposByValue[key].includes(gpoName)) {
      gposByValue[key].push(gpoName);
    }
  }

  return gposByValue;
}

function realValueKeys(gposByValue: Record<string, string[]>): string[] {
  return Object.keys(gposByValue).filter(k => k !== '(Default)');
}

export function deriveCheckOutcome(
  checkId: string,
  gposByValue: Record<string, string[]>
): {
  status: CheckStatus;
  severity: Severity;
  verdict: string;
  gposByValue: Record<string, string[]>;
} {
  const def = getSecurityCheck(checkId);
  if (!def) {
    return {
      status: 'not_in_gpo',
      severity: 'info',
      verdict: 'Unknown check',
      gposByValue,
    };
  }

  const keys = realValueKeys(gposByValue);

  if (keys.length === 0) {
    const withDefault = { '(Default)': ['No GPO - not configured via Group Policy'] };
    if (def.windowsDefault.isInsecure) {
      return {
        status: 'not_in_gpo',
        severity: def.defaultMissingSeverity,
        verdict: `Not configured via GPO — Windows default (${def.windowsDefault.valueLabel}) is insecure if unmanaged`,
        gposByValue: withDefault,
      };
    }
    return {
      status: 'not_in_gpo',
      severity: def.defaultMissingSeverity,
      verdict: `Not configured via GPO — default (${def.windowsDefault.valueLabel}); confirm other enforcement`,
      gposByValue: withDefault,
    };
  }

  const secureKeys = keys.filter(k => isSecureValue(checkId, k));
  const insecureKeys = keys.filter(k => !isSecureValue(checkId, k));

  if (insecureKeys.length > 0 && secureKeys.length > 0) {
    return {
      status: 'mixed',
      severity: severityForInsecureKeys(checkId, def, insecureKeys),
      verdict: `Mixed GPO values — ${insecureKeys.map(k => getValueLabel(checkId, k)).join(', ')} (insecure) and hardening GPOs present`,
      gposByValue,
    };
  }

  if (insecureKeys.length > 0) {
    const labels = insecureKeys.map(k => getValueLabel(checkId, k)).join(', ');
    return {
      status: 'insecure',
      severity: severityForInsecureKeys(checkId, def, insecureKeys),
      verdict: `Insecure value(s) set via GPO: ${labels}`,
      gposByValue,
    };
  }

  return {
    status: 'hardened',
    severity: 'info',
    verdict: 'Hardening value(s) set via GPO — verify host coverage (BloodHound) and non-GPO gaps',
    gposByValue,
  };
}

function severityForInsecureKeys(
  checkId: string,
  def: SecurityCheckDefinition,
  insecureKeys: string[]
): Severity {
  if (checkId === 'lm-compatibility-level') {
    let lowest = 5;
    for (const k of insecureKeys) {
      const n = parseInt(k, 10);
      if (!isNaN(n) && n < lowest) lowest = n;
    }
    if (lowest <= 2) return 'critical';
    if (lowest === 3) return 'high';
    if (lowest === 4) return 'medium';
    return def.insecureSeverity;
  }

  if (checkId === 'cached-credentials') {
    let highest = 0;
    for (const k of insecureKeys) {
      const n = parseInt(k, 10);
      if (!isNaN(n) && n > highest) highest = n;
    }
    if (highest > 10) return 'high';
    if (highest <= 2) return 'low';
    return 'medium';
  }

  if (checkId === 'ntlm-min-server-sec') {
    const NTLMV2 = 0x00080000;
    let worst: Severity = 'medium';
    for (const k of insecureKeys) {
      const num = k.startsWith('0x') ? parseInt(k, 16) : parseInt(k, 10);
      if (isNaN(num) || num === 0 || (num & NTLMV2) === 0) return 'high';
      worst = 'medium';
    }
    return worst;
  }

  if (checkId === 'ldap-server-signing' || checkId === 'ldap-channel-binding') {
    if (insecureKeys.some(k => k === '0')) return 'high';
    if (insecureKeys.some(k => k === '1')) return 'medium';
    return def.insecureSeverity;
  }

  return def.insecureSeverity;
}

export function createMisconfigurationFromCheck(
  checkId: string,
  gposByValueInput: Record<string, string[]>
): Misconfiguration {
  const def = getSecurityCheck(checkId);
  if (!def) {
    throw new Error(`Unknown security check: ${checkId}`);
  }

  const { status, severity, verdict, gposByValue } = deriveCheckOutcome(checkId, gposByValueInput);

  const gpoCount = realValueKeys(gposByValue).reduce(
    (sum, k) => sum + (gposByValue[k]?.length ?? 0),
    0
  );

  return {
    id: checkId,
    name: def.displayName,
    description: def.description,
    abuseSummary: def.abuseSummary,
    verdict,
    severity,
    status,
    category: def.category,
    registryPath: def.registryPath,
    recommendedValue: def.recommendedValue,
    policyPath: def.policyPath,
    windowsDefault: def.windowsDefault,
    gpoCount,
    gposByValue,
    possibleValues: def.possibleValues,
    scope: def.scope,
  };
}


export function detectSMBv1Server(report: GPOReport): Misconfiguration {
  const entries = findRegistryEntries(report, /LanmanServer\\Parameters/i, 'SMB1');
  return createMisconfigurationFromCheck('smbv1-server', collectGposByValue(entries));
}

export function detectLLMNR(report: GPOReport): Misconfiguration {
  const entries = findRegistryEntries(report, /DNSClient/i, 'EnableMulticast');
  return createMisconfigurationFromCheck('llmnr', collectGposByValue(entries));
}

export function detectIPv6(report: GPOReport): Misconfiguration {
  const entries = findRegistryEntries(report, /Tcpip6\\Parameters/i, 'DisabledComponents');
  return createMisconfigurationFromCheck('ipv6', collectGposByValue(entries));
}

export function detectCachedCredentials(report: GPOReport): Misconfiguration {
  const winlogon = findRegistryEntries(
    report,
    /Windows NT\\CurrentVersion\\Winlogon/i,
    'CachedLogonsCount'
  );
  const policies = findRegistryEntries(
    report,
    /Policies\\System$/i,
    'CachedLogonsCount'
  );
  const merged = collectGposByValue([...winlogon, ...policies]);
  return createMisconfigurationFromCheck('cached-credentials', merged);
}

export function detectSMBSigningServer(report: GPOReport): Misconfiguration {
  const entries = findRegistryEntries(
    report,
    /LanManServer\\Parameters/i,
    'RequireSecuritySignature'
  );
  return createMisconfigurationFromCheck('smb-signing-server', collectGposByValue(entries));
}

export function detectNoLMHash(report: GPOReport): Misconfiguration {
  const entries = findRegistryEntries(report, /Control\\Lsa$/i, 'NoLMHash');
  return createMisconfigurationFromCheck('no-lm-hash', collectGposByValue(entries));
}

export function detectLmCompatibilityLevel(report: GPOReport): Misconfiguration {
  const entries = findRegistryEntries(report, /Control\\Lsa$/i, 'LmCompatibilityLevel');
  return createMisconfigurationFromCheck('lm-compatibility-level', collectGposByValue(entries));
}

const NTLM_HEX_FORMAT = (_raw: string | null, num: number | null): string | null => {
  if (num === null) return '0x0';
  return `0x${num.toString(16)}`;
};

export function detectNtlmMinServerSec(report: GPOReport): Misconfiguration {
  const entries = findRegistryEntries(report, /Control\\Lsa\\MSV1_0/i, 'NtlmMinServerSec');
  return createMisconfigurationFromCheck(
    'ntlm-min-server-sec',
    collectGposByValue(entries, { formatKey: NTLM_HEX_FORMAT })
  );
}

export function detectNetBIOS(report: GPOReport): Misconfiguration {
  const entries = findRegistryEntries(report, /NetBT\\Parameters\\Interfaces/i, 'NetbiosOptions');
  return createMisconfigurationFromCheck('netbios', collectGposByValue(entries));
}

export function detectMDNS(report: GPOReport): Misconfiguration {
  const entries = findRegistryEntries(report, /Dnscache\\Parameters/i, 'EnableMDNS');
  return createMisconfigurationFromCheck('mdns', collectGposByValue(entries));
}

export function detectLDAPServerSigning(report: GPOReport): Misconfiguration {
  const entries = findRegistryEntries(report, /NTDS\\Parameters/i, 'LDAPServerIntegrity');
  return createMisconfigurationFromCheck('ldap-server-signing', collectGposByValue(entries));
}

export function detectLDAPChannelBinding(report: GPOReport): Misconfiguration {
  const entries = findRegistryEntries(report, /NTDS\\Parameters/i, 'LdapEnforceChannelBinding');
  return createMisconfigurationFromCheck('ldap-channel-binding', collectGposByValue(entries));
}

/** Split GPO names into secure vs insecure using SSOT. */
export function classifyGPOsBySecurity(check: Misconfiguration): {
  secureGPOs: string[];
  insecureGPOs: string[];
} {
  const secureGPOs: string[] = [];
  const insecureGPOs: string[] = [];

  for (const [value, gpos] of Object.entries(check.gposByValue)) {
    if (value === '(Default)') continue;
    if (isSecureValue(check.id, value)) {
      secureGPOs.push(...gpos);
    } else {
      insecureGPOs.push(...gpos);
    }
  }

  return {
    secureGPOs: [...new Set(secureGPOs)],
    insecureGPOs: [...new Set(insecureGPOs)],
  };
}

/** Upgrade hardened → partial_coverage when BH shows uncovered hosts. */
export function applyCoverageStatus(
  check: Misconfiguration,
  noHardeningHostCount: number,
  hasBloodHound: boolean
): Misconfiguration {
  if (!hasBloodHound) return check;
  if (check.status !== 'hardened') return check;
  if (noHardeningHostCount <= 0) return check;

  return {
    ...check,
    status: 'partial_coverage',
    severity: check.windowsDefault.isInsecure
      ? (check.scope === 'domain-controllers' ? 'medium' : 'low')
      : 'low',
    verdict: `Hardening GPO(s) present, but ${noHardeningHostCount} scoped host(s) have no hardening GPO — verify other enforcement`,
  };
}

export function detectMisconfigurations(report: GPOReport): Misconfiguration[] {
  const detectors = [
    detectSMBv1Server,
    detectLLMNR,
    detectIPv6,
    detectCachedCredentials,
    detectSMBSigningServer,
    detectLmCompatibilityLevel,
    detectNoLMHash,
    detectNtlmMinServerSec,
    detectNetBIOS,
    detectMDNS,
    detectLDAPServerSigning,
    detectLDAPChannelBinding,
  ];

  return detectors.map(detector => detector(report));
}

export type { MisconfigScope };
