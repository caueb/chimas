/** Security check definitions (SSOT for baseline detection and UI). */


import type { SecurityCategory, MisconfigScope, WindowsDefaultInfo } from '../types/Misconfiguration';
import type { Severity } from './constants';

export interface ValueDefinition {
  value: string;
  label: string;
  isSecure: boolean;
  description?: string;
}

export interface SecurityCheckDefinition {
  id: string;
  displayName: string;
  category: SecurityCategory;
  scope: MisconfigScope;
  registryPath: string;
  recommendedValue: string;
  policyPath?: string;
  possibleValues: ValueDefinition[];
  secureValues: string[];
  windowsDefault: WindowsDefaultInfo;
  insecureSeverity: Severity;
  defaultMissingSeverity: Severity;
  abuseSummary: string;
  description: string;
}

export const SECURITY_CHECKS: Record<string, SecurityCheckDefinition> = {

  'smbv1-server': {
    id: 'smbv1-server',
    displayName: 'SMBv1 Server',
    category: 'smb',
    scope: 'all-computers',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters\\SMB1',
    recommendedValue: '0 (disabled)',
    policyPath: 'Computer Configuration → Administrative Templates → MS Security Guide → Configure SMBv1 server',
    possibleValues: [
      { value: '0', label: 'Disabled', isSecure: true, description: 'SMBv1 server is disabled.' },
      { value: '1', label: 'Enabled', isSecure: false, description: 'SMBv1 server is enabled; EternalBlue / wormable SMB risk.' },
    ],
    secureValues: ['0'],
    windowsDefault: {
      valueLabel: 'Enabled on older Windows (absent key)',
      isInsecure: true,
      notes: 'Modern Windows may disable SMBv1 by default; older builds leave it enabled when the value is absent.',
    },
    insecureSeverity: 'critical',
    defaultMissingSeverity: 'critical',
    abuseSummary: 'SMBv1 enables wormable exploits (e.g. EternalBlue) and weak dialect negotiation.',
    description: 'Controls whether the SMB server accepts SMBv1 connections.',
  },

  'smb-signing-server': {
    id: 'smb-signing-server',
    displayName: 'SMB Signing (Server)',
    category: 'smb',
    scope: 'all-computers',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanManServer\\Parameters\\RequireSecuritySignature',
    recommendedValue: '1 (required)',
    policyPath: 'Computer Configuration → Windows Settings → Security Settings → Microsoft Network Server → Digitally sign communications (always)',
    possibleValues: [
      { value: '0', label: 'Not Required', isSecure: false, description: 'SMB signing optional; NTLM relay risk.' },
      { value: '1', label: 'Required', isSecure: true, description: 'SMB signing required for all connections.' },
    ],
    secureValues: ['1'],
    windowsDefault: {
      valueLabel: 'Required on DCs; not required on member servers',
      isInsecure: true,
      notes: 'Domain controllers require signing by default; member servers typically do not.',
    },
    insecureSeverity: 'high',
    defaultMissingSeverity: 'high',
    abuseSummary: 'Without required SMB signing, NTLM relay and session tampering against servers is far easier.',
    description: 'Requires SMB security signatures on the server side (SMB2+).',
  },


  'llmnr': {
    id: 'llmnr',
    displayName: 'LLMNR',
    category: 'name-resolution',
    scope: 'all-computers',
    registryPath: 'HKLM\\Software\\Policies\\Microsoft\\Windows NT\\DNSClient\\EnableMulticast',
    recommendedValue: '0 (disabled)',
    policyPath: 'Computer Configuration → Administrative Templates → Network → DNS Client → Turn off multicast name resolution',
    possibleValues: [
      { value: '0', label: 'Disabled', isSecure: true, description: 'LLMNR disabled.' },
      { value: '1', label: 'Enabled', isSecure: false, description: 'LLMNR enabled; poisoning / Responder risk.' },
    ],
    secureValues: ['0'],
    windowsDefault: {
      valueLabel: 'Enabled',
      isInsecure: true,
    },
    insecureSeverity: 'medium',
    defaultMissingSeverity: 'high',
    abuseSummary: 'LLMNR poisoning (Responder) captures NTLM hashes / relays authentication on the local network.',
    description: 'Link-Local Multicast Name Resolution (LLMNR).',
  },

  'netbios': {
    id: 'netbios',
    displayName: 'NetBIOS over TCP/IP',
    category: 'name-resolution',
    scope: 'all-computers',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\Tcpip_*\\NetbiosOptions',
    recommendedValue: '2 (disabled)',
    possibleValues: [
      { value: '0', label: 'Default (DHCP)', isSecure: false, description: 'Uses DHCP setting; often enables NetBIOS.' },
      { value: '1', label: 'Enabled', isSecure: false, description: 'NetBIOS enabled.' },
      { value: '2', label: 'Disabled', isSecure: true, description: 'NetBIOS disabled over TCP/IP.' },
    ],
    secureValues: ['2'],
    windowsDefault: {
      valueLabel: 'DHCP / often enabled',
      isInsecure: true,
    },
    insecureSeverity: 'medium',
    defaultMissingSeverity: 'high',
    abuseSummary: 'NBNS/NetBIOS name spoofing enables credential capture similar to LLMNR poisoning.',
    description: 'NetBIOS over TCP/IP on network interfaces.',
  },

  'mdns': {
    id: 'mdns',
    displayName: 'mDNS (Multicast DNS)',
    category: 'name-resolution',
    scope: 'all-computers',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Dnscache\\Parameters\\EnableMDNS',
    recommendedValue: '0 (disabled)',
    possibleValues: [
      { value: '0', label: 'Disabled', isSecure: true, description: 'mDNS disabled.' },
      { value: '1', label: 'Enabled', isSecure: false, description: 'mDNS enabled; local query leakage.' },
    ],
    secureValues: ['0'],
    windowsDefault: {
      valueLabel: 'Enabled on Windows 10 1703+',
      isInsecure: true,
    },
    insecureSeverity: 'medium',
    defaultMissingSeverity: 'high',
    abuseSummary: 'mDNS can leak name queries on the LAN and assist spoofing/poisoning workflows.',
    description: 'Multicast DNS (mDNS) via DNS Client.',
  },


  'ipv6': {
    id: 'ipv6',
    displayName: 'IPv6 Configuration',
    category: 'network',
    scope: 'all-computers',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters\\DisabledComponents',
    recommendedValue: '32 (prefer IPv4) or 255 (disabled)',
    possibleValues: [
      { value: '0', label: 'Enabled (All Components)', isSecure: false, description: 'IPv6 fully enabled.' },
      { value: '1', label: 'Tunnel Interfaces Disabled', isSecure: false, description: 'Partial disable only.' },
      { value: '16', label: 'Native Interfaces Disabled', isSecure: false, description: 'Partial disable only.' },
      { value: '17', label: 'All Interfaces Disabled', isSecure: true, description: 'Native + tunnel interfaces disabled.' },
      { value: '32', label: 'Prefer IPv4 over IPv6', isSecure: true, description: 'Microsoft-recommended prefer-IPv4.' },
      { value: '255', label: 'IPv6 Completely Disabled', isSecure: true, description: 'IPv6 fully disabled.' },
    ],
    secureValues: ['17', '32', '255'],
    windowsDefault: {
      valueLabel: 'Enabled (0 / absent)',
      isInsecure: true,
      notes: 'Full disable can break apps; prefer 32 unless policy requires full disable.',
    },
    insecureSeverity: 'medium',
    defaultMissingSeverity: 'high',
    abuseSummary: 'Unused IPv6 increases attack surface (mitm, rogue router advertisements, dual-stack pivoting).',
    description: 'IPv6 DisabledComponents bitmask.',
  },


  'cached-credentials': {
    id: 'cached-credentials',
    displayName: 'Cached Logon Credentials',
    category: 'credentials',
    scope: 'all-computers',
    registryPath: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\CachedLogonsCount',
    recommendedValue: '0 (servers) or 1-2 (workstations)',
    policyPath: 'Computer Configuration → Windows Settings → Security Settings → Interactive logon: Number of previous logons to cache',
    possibleValues: [
      { value: '0', label: 'Disabled', isSecure: true, description: 'No credentials cached (typical for servers).' },
      { value: '1', label: '1 Cached', isSecure: true, description: 'Minimal offline logon cache.' },
      { value: '2', label: '2 Cached', isSecure: true, description: 'Low cache for workstations.' },
      { value: '10', label: '10 Cached (Default)', isSecure: false, description: 'Windows default; larger offline crack surface.' },
    ],
    secureValues: ['0', '1', '2'],
    windowsDefault: {
      valueLabel: '10 (or 25 on some older Server builds)',
      isInsecure: true,
    },
    insecureSeverity: 'medium',
    defaultMissingSeverity: 'high',
    abuseSummary: 'Cached domain logons (DCC2/MSCASH) can be dumped and cracked offline after host compromise.',
    description: 'Number of domain logon credential sets cached locally.',
  },

  'no-lm-hash': {
    id: 'no-lm-hash',
    displayName: 'LM Hash Storage',
    category: 'credentials',
    scope: 'all-computers',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\NoLMHash',
    recommendedValue: '1 (do not store LM hash)',
    policyPath: 'Computer Configuration → Windows Settings → Security Settings → Network security: Do not store LAN Manager hash value on next password change',
    possibleValues: [
      { value: '0', label: 'LM Hash Stored', isSecure: false, description: 'Weak LM hashes stored.' },
      { value: '1', label: 'LM Hash Not Stored', isSecure: true, description: 'LM hashes not stored.' },
    ],
    secureValues: ['1'],
    windowsDefault: {
      valueLabel: '1 on modern Windows (secure default)',
      isInsecure: false,
      notes: 'Explicit GPO still recommended for consistent enforcement across mixed estates.',
    },
    insecureSeverity: 'medium',
    defaultMissingSeverity: 'low',
    abuseSummary: 'Stored LM hashes crack extremely quickly and enable legacy auth attacks.',
    description: 'Whether Windows stores LAN Manager password hashes.',
  },


  'lm-compatibility-level': {
    id: 'lm-compatibility-level',
    displayName: 'LAN Manager Authentication Level',
    category: 'ntlm',
    scope: 'all-computers',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\LmCompatibilityLevel',
    recommendedValue: '5 (NTLMv2 only)',
    policyPath: 'Computer Configuration → Windows Settings → Security Settings → Network security: LAN Manager authentication level',
    possibleValues: [
      { value: '0', label: 'Send LM & NTLM', isSecure: false, description: 'Weakest client/server behavior.' },
      { value: '1', label: 'Send LM & NTLM, use NTLMv2 if negotiated', isSecure: false },
      { value: '2', label: 'Send NTLM only', isSecure: false },
      { value: '3', label: 'Send NTLMv2 only', isSecure: false, description: 'Default; server still accepts legacy.' },
      { value: '4', label: 'Send NTLMv2, refuse LM', isSecure: false },
      { value: '5', label: 'Send NTLMv2, refuse LM & NTLM', isSecure: true, description: 'NTLMv2 only.' },
    ],
    secureValues: ['5'],
    windowsDefault: {
      valueLabel: '3 on modern Windows',
      isInsecure: true,
    },
    insecureSeverity: 'critical',
    defaultMissingSeverity: 'high',
    abuseSummary: 'Low LM compatibility enables NTLMv1/LM capture, coercion + crack, and weaker challenge/response.',
    description: 'LAN Manager authentication level (LmCompatibilityLevel).',
  },

  'ntlm-min-server-sec': {
    id: 'ntlm-min-server-sec',
    displayName: 'NTLM Minimum Server Security',
    category: 'ntlm',
    scope: 'domain-controllers',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\MSV1_0\\NtlmMinServerSec',
    recommendedValue: '0x20080000 (NTLMv2 session + 128-bit)',
    policyPath: 'Computer Configuration → Windows Settings → Security Settings → Network security: Minimum session security for NTLM SSP based (including secure RPC) servers',
    possibleValues: [
      { value: '0x0', label: 'No Minimum Security', isSecure: false },
      { value: '0x80000', label: 'Require NTLMv2 Session', isSecure: false },
      { value: '0x20000000', label: 'Require 128-bit Encryption', isSecure: false },
      { value: '0x20080000', label: 'NTLMv2 + 128-bit Encryption', isSecure: true },
    ],
    secureValues: ['0x20080000'],
    windowsDefault: {
      valueLabel: 'No minimum / weak defaults on many builds',
      isInsecure: true,
    },
    insecureSeverity: 'high',
    defaultMissingSeverity: 'low',
    abuseSummary: 'Servers accepting weak NTLM session security broaden relay and downgrade exposure (especially DCs).',
    description: 'Minimum NTLM SSP session security required by servers (DC-focused).',
  },


  'ldap-server-signing': {
    id: 'ldap-server-signing',
    displayName: 'LDAP Server Signing',
    category: 'ldap',
    scope: 'domain-controllers',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\NTDS\\Parameters\\LDAPServerIntegrity',
    recommendedValue: '2 (require signing)',
    policyPath: 'Computer Configuration → Windows Settings → Security Settings → Domain controller: LDAP server signing requirements',
    possibleValues: [
      { value: '0', label: 'None', isSecure: false, description: 'Signing not required.' },
      { value: '1', label: 'Negotiate Signing', isSecure: false, description: 'Negotiate; may allow unsigned LDAP.' },
      { value: '2', label: 'Require Signing', isSecure: true, description: 'LDAP signing required on DC.' },
    ],
    secureValues: ['2'],
    windowsDefault: {
      valueLabel: 'Negotiate (1)',
      isInsecure: true,
    },
    insecureSeverity: 'high',
    defaultMissingSeverity: 'high',
    abuseSummary: 'DCs that do not require LDAP signing are prime LDAP relay / mitm targets.',
    description: 'LDAP server signing requirements on domain controllers.',
  },

  'ldap-channel-binding': {
    id: 'ldap-channel-binding',
    displayName: 'LDAP Channel Binding',
    category: 'ldap',
    scope: 'domain-controllers',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\NTDS\\Parameters\\LdapEnforceChannelBinding',
    recommendedValue: '2 (always)',
    policyPath: 'Computer Configuration → Administrative Templates → System → LDAP → Domain controller: LDAP server channel binding token requirements',
    possibleValues: [
      { value: '0', label: 'Never', isSecure: false, description: 'CBT never required.' },
      { value: '1', label: 'When Supported', isSecure: false, description: 'Only when client supports CBT.' },
      { value: '2', label: 'Always', isSecure: true, description: 'Channel binding always required.' },
    ],
    secureValues: ['2'],
    windowsDefault: {
      valueLabel: 'Never (0) on many builds until newer cumulative updates',
      isInsecure: true,
    },
    insecureSeverity: 'high',
    defaultMissingSeverity: 'high',
    abuseSummary: 'Without LDAP channel binding, LDAPS relay attacks against DCs remain practical.',
    description: 'LDAP channel binding token enforcement on domain controllers.',
  },
} as const satisfies Record<string, SecurityCheckDefinition>;

export function getSecurityCheck(id: string): SecurityCheckDefinition | undefined {
  return SECURITY_CHECKS[id];
}

export function getAllCheckIds(): string[] {
  return Object.keys(SECURITY_CHECKS);
}

/** Canonical value key for gposByValue maps. */
export function normalizeValueKey(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let v = String(raw).trim().replace(/^["']|["']$/g, '');
  if (!v) return null;

  const paren = v.match(/^(-?\d+|0x[0-9a-fA-F]+)\s*\(/);
  if (paren) v = paren[1];

  if (/^0x/i.test(v)) {
    const num = parseInt(v, 16);
    if (isNaN(num)) return v.toLowerCase();
    return `0x${num.toString(16)}`;
  }

  const num = parseInt(v, 10);
  if (!isNaN(num) && String(num) === v.replace(/^\+/, '')) {
    return String(num);
  }

  return v;
}

/** True if value is a hardening setting for the check (unknown → insecure). */
export function isSecureValue(checkId: string, valueKey: string): boolean {
  if (valueKey === '(Default)') return false;
  const def = getSecurityCheck(checkId);
  if (!def) return false;

  const normalized = normalizeValueKey(valueKey) ?? valueKey;

  if (def.secureValues.some(s => (normalizeValueKey(s) ?? s) === normalized)) {
    return true;
  }

  const pv = def.possibleValues.find(p => (normalizeValueKey(p.value) ?? p.value) === normalized);
  if (pv) return pv.isSecure;

  if (checkId === 'cached-credentials') {
    const n = parseInt(normalized, 10);
    if (!isNaN(n) && n >= 0 && n <= 2) return true;
  }

  if (checkId === 'ntlm-min-server-sec') {
    const NTLMV2 = 0x00080000;
    const ENC128 = 0x20000000;
    let num: number;
    if (normalized.startsWith('0x')) num = parseInt(normalized, 16);
    else num = parseInt(normalized, 10);
    if (!isNaN(num) && (num & NTLMV2) !== 0 && (num & ENC128) !== 0) return true;
  }

  return false;
}

export function getValueLabel(checkId: string, valueKey: string): string {
  if (valueKey === '(Default)') return 'Windows default (not set via GPO)';
  const def = getSecurityCheck(checkId);
  if (!def) return valueKey;
  const normalized = normalizeValueKey(valueKey) ?? valueKey;
  const pv = def.possibleValues.find(p => (normalizeValueKey(p.value) ?? p.value) === normalized);
  if (pv) return pv.label;

  if (checkId === 'cached-credentials') {
    const n = parseInt(normalized, 10);
    if (!isNaN(n)) return `${n} Cached`;
  }

  return valueKey;
}
