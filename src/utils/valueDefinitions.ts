/**
 * Security Check Value Definitions
 *
 * Single source of truth for all security check metadata including:
 * - Check identification (id, displayName)
 * - Registry paths
 * - Recommended secure values
 * - All possible values with human-readable labels and security classification
 *
 * Used by:
 * - Detection functions (misconfigDetection.ts) for check IDs and registry paths
 * - Detail panel UI for displaying "Possible Values" section
 *
 * Coverage: 16 checks total
 */

/**
 * Represents a single possible value for a registry setting
 */
export interface ValueDefinition {
  value: string;           // Raw value (e.g., "0", "1", "0x20080000")
  label: string;           // Human-readable label (e.g., "Disabled", "NTLMv2 only")
  isSecure: boolean;       // Security classification
  description?: string;    // Optional extra context (keep to 1 sentence)
}

/**
 * Complete definition for a security check
 */
export interface SecurityCheckDefinition {
  id: string;              // Matches Misconfiguration.id (e.g., "smbv1-server")
  displayName: string;     // Human-readable name
  registryPath: string;    // Full registry path
  recommendedValue: string; // Value to recommend
  possibleValues: ValueDefinition[];
}

/**
 * Map of all security check definitions keyed by check ID
 *
 * Existing 11 checks: smbv1-server, smbv1-client, llmnr, ipv6, cached-credentials,
 *   smb-signing-server, smb-signing-client, lm-compatibility-level, no-lm-hash,
 *   ntlm-min-client-sec, ntlm-min-server-sec
 *
 * New 4 checks (Phase 10): netbios, mdns, ldap-client-signing, ldap-channel-binding
 */
export const SECURITY_CHECKS: Record<string, SecurityCheckDefinition> = {
  // ==========================================================================
  // SMB Protocol Checks
  // ==========================================================================

  'smbv1-server': {
    id: 'smbv1-server',
    displayName: 'SMBv1 Server',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters\\SMB1',
    recommendedValue: '0 (disabled)',
    possibleValues: [
      { value: '0', label: 'Disabled', isSecure: true, description: 'SMBv1 server is disabled.' },
      { value: '1', label: 'Enabled', isSecure: false, description: 'SMBv1 server is enabled, vulnerable to EternalBlue.' },
      { value: '(Not Set)', label: 'Not Set (Default Enabled)', isSecure: false, description: 'Defaults to enabled on older Windows versions.' },
    ],
  },

  'smbv1-client': {
    id: 'smbv1-client',
    displayName: 'SMBv1 Client',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\mrxsmb10\\Start',
    recommendedValue: '4 (disabled)',
    possibleValues: [
      { value: '2', label: 'Auto Start', isSecure: false, description: 'Driver starts automatically.' },
      { value: '3', label: 'Manual Start', isSecure: false, description: 'Driver starts on demand.' },
      { value: '4', label: 'Disabled', isSecure: true, description: 'Driver is disabled.' },
    ],
  },

  'smb-signing-server': {
    id: 'smb-signing-server',
    displayName: 'SMB Signing (Server)',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanManServer\\Parameters\\RequireSecuritySignature',
    recommendedValue: '1 (required)',
    possibleValues: [
      { value: '0', label: 'Not Required', isSecure: false, description: 'SMB signing is optional, vulnerable to relay attacks.' },
      { value: '1', label: 'Required', isSecure: true, description: 'SMB signing is required for all connections.' },
    ],
  },

  'smb-signing-client': {
    id: 'smb-signing-client',
    displayName: 'SMB Signing (Client)',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanManWorkstation\\Parameters\\RequireSecuritySignature',
    recommendedValue: '1 (required)',
    possibleValues: [
      { value: '0', label: 'Not Required', isSecure: false, description: 'SMB signing is optional for client connections.' },
      { value: '1', label: 'Required', isSecure: true, description: 'SMB signing is required for client connections.' },
    ],
  },

  // ==========================================================================
  // Name Resolution Checks
  // ==========================================================================

  'llmnr': {
    id: 'llmnr',
    displayName: 'LLMNR',
    registryPath: 'HKLM\\Software\\Policies\\Microsoft\\Windows NT\\DNSClient\\EnableMulticast',
    recommendedValue: '0 (disabled)',
    possibleValues: [
      { value: '0', label: 'Disabled', isSecure: true, description: 'LLMNR is disabled, prevents poisoning attacks.' },
      { value: '1', label: 'Enabled', isSecure: false, description: 'LLMNR is enabled, vulnerable to Responder attacks.' },
    ],
  },

  'netbios': {
    id: 'netbios',
    displayName: 'NetBIOS over TCP/IP',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\Tcpip_*\\NetbiosOptions',
    recommendedValue: '2 (disabled)',
    possibleValues: [
      { value: '0', label: 'Default (DHCP)', isSecure: false, description: 'Uses DHCP server setting, often enabled.' },
      { value: '1', label: 'Enabled', isSecure: false, description: 'NetBIOS is enabled, vulnerable to name poisoning.' },
      { value: '2', label: 'Disabled', isSecure: true, description: 'NetBIOS is disabled over TCP/IP.' },
    ],
  },

  'mdns': {
    id: 'mdns',
    displayName: 'mDNS (Multicast DNS)',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Dnscache\\Parameters\\EnableMDNS',
    recommendedValue: '0 (disabled)',
    possibleValues: [
      { value: '0', label: 'Disabled', isSecure: true, description: 'mDNS is disabled.' },
      { value: '1', label: 'Enabled', isSecure: false, description: 'mDNS is enabled, can leak queries to local network.' },
    ],
  },

  // ==========================================================================
  // IPv6 Configuration
  // ==========================================================================

  'ipv6': {
    id: 'ipv6',
    displayName: 'IPv6 Configuration',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters\\DisabledComponents',
    recommendedValue: '32 (prefer IPv4) or 255 (disabled)',
    possibleValues: [
      { value: '0', label: 'Enabled (All Components)', isSecure: false, description: 'IPv6 fully enabled, increases attack surface.' },
      { value: '1', label: 'Tunnel Interfaces Disabled', isSecure: false, description: 'Only tunnel interfaces disabled.' },
      { value: '16', label: 'Native Interfaces Disabled', isSecure: false, description: 'Native IPv6 disabled but tunnels enabled.' },
      { value: '17', label: 'All Interfaces Disabled', isSecure: true, description: 'All IPv6 interfaces disabled.' },
      { value: '32', label: 'Prefer IPv4 over IPv6', isSecure: true, description: 'IPv4 preferred (Microsoft recommended).' },
      { value: '255', label: 'IPv6 Completely Disabled', isSecure: true, description: 'IPv6 fully disabled on all components.' },
    ],
  },

  // ==========================================================================
  // Credential Storage
  // ==========================================================================

  'cached-credentials': {
    id: 'cached-credentials',
    displayName: 'Cached Logon Credentials',
    registryPath: 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\CachedLogonsCount',
    recommendedValue: '0 (servers) or 1-2 (workstations)',
    possibleValues: [
      { value: '0', label: 'Disabled', isSecure: true, description: 'No credentials cached (recommended for servers).' },
      { value: '1', label: '1 Cached', isSecure: true, description: 'Minimal caching for offline logon.' },
      { value: '2', label: '2 Cached', isSecure: true, description: 'Low caching for workstations.' },
      { value: '10', label: '10 Cached (Default)', isSecure: false, description: 'Windows default, excessive for most environments.' },
      { value: '>10', label: 'More than 10', isSecure: false, description: 'High risk, many cached credentials to crack.' },
    ],
  },

  'no-lm-hash': {
    id: 'no-lm-hash',
    displayName: 'LM Hash Storage',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\NoLMHash',
    recommendedValue: '1 (no LM hash storage)',
    possibleValues: [
      { value: '0', label: 'LM Hash Stored', isSecure: false, description: 'Weak LM hashes stored, easily cracked.' },
      { value: '1', label: 'LM Hash Not Stored', isSecure: true, description: 'Only NTLM hashes stored.' },
    ],
  },

  // ==========================================================================
  // NTLM Authentication
  // ==========================================================================

  'lm-compatibility-level': {
    id: 'lm-compatibility-level',
    displayName: 'LAN Manager Authentication Level',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\LmCompatibilityLevel',
    recommendedValue: '5 (NTLMv2 only)',
    possibleValues: [
      { value: '0', label: 'Send LM & NTLM responses', isSecure: false, description: 'Sends weakest hashes, highly vulnerable.' },
      { value: '1', label: 'Send LM & NTLM, use NTLMv2 if negotiated', isSecure: false, description: 'Still sends weak hashes initially.' },
      { value: '2', label: 'Send NTLM response only', isSecure: false, description: 'No LM but NTLMv1 still sent.' },
      { value: '3', label: 'Send NTLMv2 response only', isSecure: false, description: 'Sends NTLMv2 but server accepts legacy.' },
      { value: '4', label: 'Send NTLMv2, refuse LM', isSecure: false, description: 'Server refuses LM but accepts NTLMv1.' },
      { value: '5', label: 'Send NTLMv2, refuse LM & NTLM', isSecure: true, description: 'NTLMv2 only, most secure setting.' },
    ],
  },

  'ntlm-min-client-sec': {
    id: 'ntlm-min-client-sec',
    displayName: 'NTLM Minimum Client Security',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\MSV1_0\\NtlmMinClientSec',
    recommendedValue: '0x20080000 (NTLMv2 + 128-bit)',
    possibleValues: [
      { value: '0x0', label: 'No Minimum Security', isSecure: false, description: 'No session security requirements.' },
      { value: '0x80000', label: 'Require NTLMv2 Session', isSecure: false, description: 'NTLMv2 required but no encryption requirement.' },
      { value: '0x20000000', label: 'Require 128-bit Encryption', isSecure: false, description: '128-bit encryption but no NTLMv2 requirement.' },
      { value: '0x20080000', label: 'NTLMv2 + 128-bit Encryption', isSecure: true, description: 'Both NTLMv2 session and 128-bit encryption required.' },
    ],
  },

  'ntlm-min-server-sec': {
    id: 'ntlm-min-server-sec',
    displayName: 'NTLM Minimum Server Security',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\MSV1_0\\NtlmMinServerSec',
    recommendedValue: '0x20080000 (NTLMv2 + 128-bit)',
    possibleValues: [
      { value: '0x0', label: 'No Minimum Security', isSecure: false, description: 'No session security requirements.' },
      { value: '0x80000', label: 'Require NTLMv2 Session', isSecure: false, description: 'NTLMv2 required but no encryption requirement.' },
      { value: '0x20000000', label: 'Require 128-bit Encryption', isSecure: false, description: '128-bit encryption but no NTLMv2 requirement.' },
      { value: '0x20080000', label: 'NTLMv2 + 128-bit Encryption', isSecure: true, description: 'Both NTLMv2 session and 128-bit encryption required.' },
    ],
  },

  // ==========================================================================
  // LDAP Security (Phase 10 - New Checks)
  // ==========================================================================

  'ldap-client-signing': {
    id: 'ldap-client-signing',
    displayName: 'LDAP Client Signing',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\LDAP\\LDAPClientIntegrity',
    recommendedValue: '2 (required)',
    possibleValues: [
      { value: '0', label: 'None', isSecure: false, description: 'LDAP signing disabled.' },
      { value: '1', label: 'Negotiate Signing', isSecure: false, description: 'Signing negotiated but not required.' },
      { value: '2', label: 'Require Signing', isSecure: true, description: 'LDAP signing required for all connections.' },
    ],
  },

  'ldap-server-signing': {
    id: 'ldap-server-signing',
    displayName: 'LDAP Server Signing',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\NTDS\\Parameters\\LDAPServerIntegrity',
    recommendedValue: '2 (required)',
    possibleValues: [
      { value: '1', label: 'None', isSecure: false, description: 'Signing negotiated but not required.' },
      { value: '2', label: 'Require Signing', isSecure: true, description: 'LDAP signing required for server connections.' },
    ],
  },

  'ldap-channel-binding': {
    id: 'ldap-channel-binding',
    displayName: 'LDAP Channel Binding',
    registryPath: 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\NTDS\\Parameters\\LdapEnforceChannelBinding',
    recommendedValue: '2 (required)',
    possibleValues: [
      { value: '0', label: 'Never', isSecure: false, description: 'Channel binding tokens never required.' },
      { value: '1', label: 'When Supported', isSecure: false, description: 'Required only when client supports it.' },
      { value: '2', label: 'Always', isSecure: true, description: 'Channel binding tokens always required.' },
    ],
  },
} as const;

/**
 * Get a security check definition by ID
 * @param id - The check ID (e.g., "smbv1-server")
 * @returns The SecurityCheckDefinition or undefined if not found
 */
export function getSecurityCheck(id: string): SecurityCheckDefinition | undefined {
  return SECURITY_CHECKS[id];
}

/**
 * Get all check IDs as an array
 * @returns Array of all check ID strings
 */
export function getAllCheckIds(): string[] {
  return Object.keys(SECURITY_CHECKS);
}
