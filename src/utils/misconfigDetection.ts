import { GPOReport, Gpo, SettingBlock } from './GPOParser';
import { Misconfiguration, MisconfigScope } from '../types/Misconfiguration';
import { Severity } from './constants';
import { getSecurityCheck } from './valueDefinitions';

// Helper to find registry entries matching a path pattern
// Group3r format stores registry settings with fields:
//   Key = "HKEY_LOCAL_MACHINE\...\Path"
//   Value Name = "SettingName"
//   Value String = "value"
export function findRegistryEntries(
  report: GPOReport,
  pathPattern: RegExp,
  valueName?: string
): Array<{ gpo: Gpo; setting: SettingBlock; value: string | null }> {
  const results: Array<{ gpo: Gpo; setting: SettingBlock; value: string | null }> = [];

  for (const gpo of report.gpos) {
    for (const setting of gpo.settings) {
      if (setting.category?.toLowerCase() !== 'registry') continue;

      // Get the registry path from the "Key" field
      const registryPath = setting.entries['Key'] || '';

      // Check if the registry path matches our pattern
      if (!pathPattern.test(registryPath)) continue;

      // If valueName specified, check if this setting is for that value
      if (valueName) {
        const entryValueName = setting.entries['Value Name'] || '';
        if (!entryValueName.toLowerCase().includes(valueName.toLowerCase())) continue;
      }

      // Get the actual value from "Value String" or "Value"
      const value = setting.entries['Value String'] || setting.entries['Value'] || null;
      results.push({ gpo, setting, value });
    }
  }

  return results;
}

// Extract specific value from registry entry
export function extractRegistryValue(
  entries: Record<string, string>,
  pathKey: string,
  valueName: string
): string | null {
  // Registry entries may have value inline or in separate entry
  const valueKey = `${pathKey}\\${valueName}`;
  if (entries[valueKey]) return entries[valueKey];

  // Check for value name as separate entry
  for (const [key, val] of Object.entries(entries)) {
    if (key.toLowerCase().includes(valueName.toLowerCase())) {
      return val;
    }
  }

  return null;
}

// Parse registry value (handles hex, decimal, REG_SZ)
export function parseRegistryValue(value: string | null): number | null {
  if (value === null) return null;
  const trimmed = value.trim();
  if (trimmed.startsWith('0x')) {
    return parseInt(trimmed, 16);
  }
  const num = parseInt(trimmed, 10);
  return isNaN(num) ? null : num;
}

// Create a misconfiguration finding
export function createMisconfiguration(
  id: string,
  name: string,
  description: string,
  severity: Severity,
  registryPath: string,
  recommendedValue: string,
  gposByValue: Record<string, string[]>,
  scope: MisconfigScope = 'all-computers'
): Misconfiguration {
  // Calculate total GPO count across all value groups
  // Exclude "(Default)" entries since they're not actual GPOs
  const gpoCount = Object.entries(gposByValue)
    .filter(([key]) => key !== '(Default)')
    .reduce((sum, [, gpos]) => sum + gpos.length, 0);

  // Look up value definitions for this check
  const checkDef = getSecurityCheck(id);

  return {
    id,
    name,
    description,
    severity,
    registryPath,
    recommendedValue,
    gpoCount,
    gposByValue,
    possibleValues: checkDef?.possibleValues,
    scope,
  };
}

// SMBv1 Server Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters\SMB1
// Value: 1 = enabled (insecure), 0 = disabled, absent = enabled (insecure)
export function detectSMBv1Server(report: GPOReport): Misconfiguration {
  const pathPattern = /LanmanServer\\Parameters/i;
  const entries = findRegistryEntries(report, pathPattern, 'SMB1');

  const gposByValue: Record<string, string[]> = {};

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    const valueKey = numValue !== null ? String(numValue) : '(Not Set)';
    if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
    gposByValue[valueKey].push(gpoName);
  }

  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanmanServer\\Parameters\\SMB1';
  const recommendedValue = '0 (disabled)';

  // If no GPOs configure this, SMBv1 is enabled by default (insecure)
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default'];
    return createMisconfiguration(
      'smbv1-server',
      'SMBv1 Server Enabled (Default)',
      'SMBv1 is enabled by default when no GPO configures it.',
      'critical',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check if any insecure values exist (1 or not set = enabled)
  const hasInsecure = Object.keys(gposByValue).some(v => v !== '0');
  if (hasInsecure) {
    return createMisconfiguration(
      'smbv1-server',
      'SMBv1 Server Enabled',
      'SMBv1 is explicitly enabled via GPO.',
      'critical',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured - return info for coverage verification
  return createMisconfiguration(
    'smbv1-server',
    'SMBv1 Server Disabled',
    'SMBv1 is properly disabled. Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}

// SMBv1 Client Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\services\mrxsmb10\Start
// Value: 4 = disabled, 2/3 = enabled (insecure)
export function detectSMBv1Client(report: GPOReport): Misconfiguration {
  const pathPattern = /mrxsmb10/i;
  const entries = findRegistryEntries(report, pathPattern, 'Start');

  const gposByValue: Record<string, string[]> = {};
  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\mrxsmb10\\Start';
  const recommendedValue = '4 (disabled)';

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue !== null) {
      // Format Start values with their meaning
      let valueKey: string;
      if (numValue === 2) valueKey = '2 (auto)';
      else if (numValue === 3) valueKey = '3 (manual)';
      else if (numValue === 4) valueKey = '4 (disabled)';
      else valueKey = String(numValue);

      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
    }
  }

  // If no GPOs configure this, SMBv1 client uses Windows default
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default'];
    return createMisconfiguration(
      'smbv1-client',
      'SMBv1 Client Not Configured',
      'SMBv1 client driver (mrxsmb10) not configured via GPO. Windows 10 1709+ disables by default, older versions may have it enabled.',
      'low',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check if any insecure values exist (not 4)
  const hasInsecure = Object.keys(gposByValue).some(v => !v.startsWith('4'));
  if (hasInsecure) {
    return createMisconfiguration(
      'smbv1-client',
      'SMBv1 Client Enabled',
      'SMBv1 client driver (mrxsmb10) is enabled. Can be exploited during SMB connections to malicious servers.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured
  return createMisconfiguration(
    'smbv1-client',
    'SMBv1 Client Disabled',
    'SMBv1 client is properly disabled. Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}

// LLMNR Detection
// Registry: HKLM\Software\Policies\Microsoft\Windows NT\DNSClient\EnableMulticast
// Value: 0 = disabled (secure), 1 or absent = enabled (insecure)
export function detectLLMNR(report: GPOReport): Misconfiguration {
  const pathPattern = /DNSClient/i;
  const entries = findRegistryEntries(report, pathPattern, 'EnableMulticast');

  const gposByValue: Record<string, string[]> = {};

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue !== null) {
      const valueKey = String(numValue);
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
    }
  }

  const registryPath = 'HKLM\\Software\\Policies\\Microsoft\\Windows NT\\DNSClient\\EnableMulticast';
  const recommendedValue = '0 (disabled)';

  // If no GPOs configure this, LLMNR is enabled by default
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default'];
    return createMisconfiguration(
      'llmnr',
      'LLMNR Enabled (Default)',
      'LLMNR is enabled by default when no GPO configures it. Allows credential theft via LLMNR poisoning attacks (Responder, etc.).',
      'high',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check if any insecure values exist (1 = enabled)
  const hasInsecure = Object.keys(gposByValue).some(v => v === '1');
  if (hasInsecure) {
    return createMisconfiguration(
      'llmnr',
      'LLMNR Enabled',
      'LLMNR is explicitly enabled via GPO. Allows credential theft via LLMNR poisoning attacks (Responder, etc.).',
      'medium',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured
  return createMisconfiguration(
    'llmnr',
    'LLMNR Disabled',
    'LLMNR is properly disabled. Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}

// IPv6 Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Services\Tcpip6\Parameters\DisabledComponents
// Value: 0 or absent = enabled (higher attack surface)
// Values 1, 16, 17, 32, 255 = various levels of disabled (secure)
export function detectIPv6(report: GPOReport): Misconfiguration {
  const pathPattern = /Tcpip6\\Parameters/i;
  const entries = findRegistryEntries(report, pathPattern, 'DisabledComponents');

  const gposByValue: Record<string, string[]> = {};

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue !== null) {
      const valueKey = String(numValue);
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
    }
  }

  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Tcpip6\\Parameters\\DisabledComponents';
  const recommendedValue = '32 (prefer IPv4) or 255 (disabled)';

  // If no GPOs configure this, IPv6 is enabled by default
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default'];
    return createMisconfiguration(
      'ipv6',
      'IPv6 Enabled (Default)',
      'IPv6 is enabled by default. Increases attack surface; consider disabling if not needed (CIS Benchmark Level 2). Note: Microsoft recommends value 32 (prefer IPv4) instead of full disable.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check if any insecure values exist (0 = enabled)
  // Secure values: 1, 16, 17, 32, 255 (various disable levels)
  const secureValues = ['1', '16', '17', '32', '255'];
  const hasInsecure = Object.keys(gposByValue).some(v => !secureValues.includes(v));
  if (hasInsecure) {
    return createMisconfiguration(
      'ipv6',
      'IPv6 Enabled',
      'IPv6 is explicitly enabled (DisabledComponents=0). Increases attack surface; consider value 32 (prefer IPv4) or 255 (full disable).',
      'medium',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured
  return createMisconfiguration(
    'ipv6',
    'IPv6 Disabled/Preferred IPv4',
    'IPv6 is properly configured. Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}

// Cached Credentials Detection
// Registry paths:
// 1. HKLM\Software\Microsoft\Windows NT\CurrentVersion\Winlogon\CachedLogonsCount
// 2. HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Policies\System\CachedLogonsCount
// Type: REG_SZ (STRING, not DWORD!)
// Value: "0" = disabled (secure), "1"-"50" = enabled (insecure)
// Default: 10 (or 25 on Windows Server 2008) when absent
export function detectCachedCredentials(report: GPOReport): Misconfiguration {
  // Check both possible registry paths
  const pathPatterns = [
    /Winlogon/i,
    /Policies\\System/i
  ];

  const gposByValue: Record<string, string[]> = {};
  let highestValue = 0;

  for (const pathPattern of pathPatterns) {
    const entries = findRegistryEntries(report, pathPattern, 'CachedLogonsCount');

    for (const { gpo, value } of entries) {
      const gpoName = gpo.header.gpo || 'Unknown GPO';

      if (value === null) continue;

      // Parse as string (REG_SZ) - remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, '').trim();
      const numValue = parseInt(cleanValue, 10);

      if (isNaN(numValue)) continue;

      const valueKey = String(numValue);
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);

      if (numValue > highestValue) {
        highestValue = numValue;
      }
    }
  }

  const registryPath = 'HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion\\Winlogon\\CachedLogonsCount';
  const recommendedValue = '0 (servers) or 1-2 (workstations)';

  // If no GPOs configure this, default is 10 cached logons
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default (10)'];
    return createMisconfiguration(
      'cached-credentials',
      'Cached Credentials Enabled (Default)',
      'CachedLogonsCount is not configured; Windows defaults to caching 10 credential sets. Cached credentials (MSCACHEv2/DCC2) can be extracted and cracked offline.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check if any insecure values exist (any value > 0)
  const hasInsecure = Object.keys(gposByValue).some(v => v !== '0');
  if (hasInsecure) {
    // Determine severity based on highest value found
    let severity: Severity = 'medium';
    if (highestValue > 10) {
      severity = 'high';
    } else if (highestValue <= 2) {
      severity = 'low';
    }

    return createMisconfiguration(
      'cached-credentials',
      `Cached Credentials Enabled (${highestValue})`,
      `CachedLogonsCount is set to ${highestValue}. Cached credentials (MSCACHEv2/DCC2) can be extracted and cracked offline. Consider setting to 0 for servers, 1-2 for workstations.`,
      severity,
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured
  return createMisconfiguration(
    'cached-credentials',
    'Cached Credentials Disabled',
    'CachedLogonsCount is properly set to 0. Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}

// SMB Signing Server Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Services\LanManServer\Parameters\RequireSecuritySignature
// Value: 1 = required (secure), 0 = not required (insecure)
// Note: EnableSecuritySignature is ignored for SMB2+ - only flag RequireSecuritySignature
export function detectSMBSigningServer(report: GPOReport): Misconfiguration {
  const pathPattern = /LanManServer\\Parameters/i;
  const entries = findRegistryEntries(report, pathPattern, 'RequireSecuritySignature');

  const gposByValue: Record<string, string[]> = {};
  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanManServer\\Parameters\\RequireSecuritySignature';
  const recommendedValue = '1 (required)';

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue !== null) {
      const valueKey = String(numValue);
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
    }
  }

  // If no GPOs configure this
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default'];
    return createMisconfiguration(
      'smb-signing-server',
      'SMB Signing Not Configured (Server)',
      'SMB signing not configured via GPO. Domain controllers require signing by default, but member servers do not.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check if any insecure values exist (0 = not required)
  const hasInsecure = Object.keys(gposByValue).some(v => v === '0');
  if (hasInsecure) {
    return createMisconfiguration(
      'smb-signing-server',
      'SMB Signing Not Required (Server)',
      'SMB signing not required on server. Vulnerable to NTLM relay attacks (CVE-2025-33073).',
      'high',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured
  return createMisconfiguration(
    'smb-signing-server',
    'SMB Signing Required (Server)',
    'SMB signing is properly required on server. Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}

// SMB Signing Client Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Services\LanManWorkstation\Parameters\RequireSecuritySignature
// Value: 1 = required (secure), 0 = not required (insecure)
// Note: EnableSecuritySignature is ignored for SMB2+ - only flag RequireSecuritySignature
export function detectSMBSigningClient(report: GPOReport): Misconfiguration {
  const pathPattern = /LanManWorkstation\\Parameters/i;
  const entries = findRegistryEntries(report, pathPattern, 'RequireSecuritySignature');

  const gposByValue: Record<string, string[]> = {};
  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\LanManWorkstation\\Parameters\\RequireSecuritySignature';
  const recommendedValue = '1 (required)';

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue !== null) {
      const valueKey = String(numValue);
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
    }
  }

  // If no GPOs configure this
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default (enabled)'];
    return createMisconfiguration(
      'smb-signing-client',
      'SMB Signing Not Configured (Client)',
      'SMB signing not configured via GPO. Windows defaults to not requiring signing on clients.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check if any insecure values exist (0 = not required)
  const hasInsecure = Object.keys(gposByValue).some(v => v === '0');
  if (hasInsecure) {
    return createMisconfiguration(
      'smb-signing-client',
      'SMB Signing Not Required (Client)',
      'SMB signing not required on client. May connect to servers without integrity protection.',
      'medium',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured
  return createMisconfiguration(
    'smb-signing-client',
    'SMB Signing Required (Client)',
    'SMB signing is properly required on client. Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}

// NoLMHash Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Control\Lsa\NoLMHash
// Value 1 = SECURE (LM hash storage disabled)
// Value 0 = INSECURE (LM hash storage enabled) - MEDIUM severity
// Absent = INSECURE (LM hashes stored by default) - MEDIUM severity
export function detectNoLMHash(report: GPOReport): Misconfiguration {
  const pathPattern = /Control\\Lsa$/i;
  const entries = findRegistryEntries(report, pathPattern, 'NoLMHash');

  const gposByValue: Record<string, string[]> = {};
  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\NoLMHash';
  const recommendedValue = '1 (no LM hash storage)';

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue !== null) {
      const valueKey = String(numValue);
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
    }
  }

  // If no GPOs configure this
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default'];
    return createMisconfiguration(
      'no-lm-hash',
      'NoLMHash Not Configured',
      'NoLMHash not configured via GPO. Modern Windows defaults to 1 (secure), but explicit GPO ensures consistent enforcement.',
      'low',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check if any insecure values exist (0 = LM hash storage enabled)
  const hasInsecure = Object.keys(gposByValue).some(v => v === '0');
  if (hasInsecure) {
    return createMisconfiguration(
      'no-lm-hash',
      'LM Hash Storage Enabled',
      'NoLMHash is disabled. Windows will store weak LM password hashes that can be cracked quickly.',
      'medium',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured
  return createMisconfiguration(
    'no-lm-hash',
    'LM Hash Storage Disabled',
    'NoLMHash is properly set to 1. Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}

// LmCompatibilityLevel Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Control\Lsa\LmCompatibilityLevel
// Value 0-2: CRITICAL (sends/accepts LM or NTLMv1)
// Value 3: HIGH (default, server accepts legacy protocols)
// Value 4: MEDIUM (server accepts NTLMv1)
// Value 5: SECURE (NTLMv2 only)
export function detectLmCompatibilityLevel(report: GPOReport): Misconfiguration {
  const pathPattern = /Control\\Lsa$/i;
  const entries = findRegistryEntries(report, pathPattern, 'LmCompatibilityLevel');

  const gposByValue: Record<string, string[]> = {};
  let lowestValue: number | null = null;

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);
    if (numValue === null) continue;

    const valueKey = String(numValue);
    if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
    gposByValue[valueKey].push(gpoName);

    if (numValue >= 0 && numValue <= 4) {
      if (lowestValue === null || numValue < lowestValue) {
        lowestValue = numValue;
      }
    }
  }

  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\LmCompatibilityLevel';
  const recommendedValue = '5 (NTLMv2 only)';

  // If no GPOs configure this, default is level 3 (HIGH)
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default (Level 3)'];
    return createMisconfiguration(
      'lm-compatibility-level',
      'NTLM Authentication Level Weak (Level 3)',
      'LmCompatibilityLevel not configured; Windows defaults to level 3. Server still accepts legacy LM/NTLM authentication.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check if any insecure values exist (0-4)
  const hasInsecure = Object.keys(gposByValue).some(v => {
    const n = parseInt(v, 10);
    return !isNaN(n) && n >= 0 && n <= 4;
  });

  if (hasInsecure && lowestValue !== null) {
    // Determine severity and name based on lowest (worst) value found
    let severity: Severity;
    let name: string;
    let description: string;

    if (lowestValue >= 0 && lowestValue <= 2) {
      severity = 'critical';
      name = `NTLM Authentication Level Critical (Level ${lowestValue})`;
      description = `LmCompatibilityLevel=${lowestValue} allows sending weak LM/NTLM hashes. Vulnerable to credential theft.`;
    } else if (lowestValue === 3) {
      severity = 'high';
      name = 'NTLM Authentication Level Weak (Level 3)';
      description = 'LmCompatibilityLevel=3 (default) still accepts legacy LM/NTLM authentication.';
    } else {
      // lowestValue === 4
      severity = 'medium';
      name = 'NTLM Authentication Level Marginal (Level 4)';
      description = 'LmCompatibilityLevel=4 refuses LM but accepts NTLMv1.';
    }

    return createMisconfiguration(
      'lm-compatibility-level',
      name,
      description,
      severity,
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured (all GPOs set to level 5)
  return createMisconfiguration(
    'lm-compatibility-level',
    'NTLM Authentication Level Secure (Level 5)',
    'LmCompatibilityLevel is properly set to 5 (NTLMv2 only). Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}

// NTLM session security bitmask constants
const NTLMV2_SESSION_FLAG = 0x00080000;  // 524288 - Require NTLMv2 session
const ENCRYPT_128_FLAG = 0x20000000;     // 536870912 - Require 128-bit encryption

// NtlmMinClientSec Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Control\Lsa\MSV1_0\NtlmMinClientSec
// Bitmask evaluation:
// - Both NTLMV2_SESSION_FLAG AND ENCRYPT_128_FLAG = SECURE
// - NTLMV2_SESSION_FLAG but not ENCRYPT_128_FLAG = MEDIUM
// - Missing NTLMV2_SESSION_FLAG or value=0 = HIGH
export function detectNtlmMinClientSec(report: GPOReport): Misconfiguration {
  const pathPattern = /Control\\Lsa\\MSV1_0/i;
  const entries = findRegistryEntries(report, pathPattern, 'NtlmMinClientSec');

  const gposByValue: Record<string, string[]> = {};
  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\MSV1_0\\NtlmMinClientSec';
  const recommendedValue = '0x20080000 (NTLMv2 + 128-bit)';
  let worstSeverity: Severity | null = null;
  let worstDescription = '';

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue === null || numValue === 0) {
      // Value 0 or unparseable = HIGH severity
      const valueKey = '0x0';
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
      if (worstSeverity !== 'high') {
        worstSeverity = 'high';
        worstDescription = 'No minimum NTLM session security enforced.';
      }
    } else {
      const hasNtlmv2 = (numValue & NTLMV2_SESSION_FLAG) !== 0;
      const has128bit = (numValue & ENCRYPT_128_FLAG) !== 0;
      const valueKey = `0x${numValue.toString(16)}`;

      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);

      if (hasNtlmv2 && has128bit) {
        // Secure - both flags set (no severity change needed)
      } else if (hasNtlmv2 && !has128bit) {
        // MEDIUM - has NTLMv2 but not 128-bit
        if (worstSeverity === null) {
          worstSeverity = 'medium';
          worstDescription = 'Requires NTLMv2 but not 128-bit encryption.';
        }
      } else {
        // HIGH - missing NTLMv2 flag
        if (worstSeverity !== 'high') {
          worstSeverity = 'high';
          worstDescription = 'Does not require NTLMv2 session security.';
        }
      }
    }
  }

  // If no GPOs configure this
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default'];
    return createMisconfiguration(
      'ntlm-min-client-sec',
      'NTLM Client Session Security Not Configured',
      'NtlmMinClientSec not configured via GPO. Windows defaults may not enforce NTLMv2 or 128-bit encryption.',
      'low',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check if there are any insecure values (anything not matching secure pattern)
  const hasInsecure = Object.keys(gposByValue).some(valueKey => {
    if (valueKey === '0x0') return true;
    const numValue = parseInt(valueKey.replace('0x', ''), 16);
    const hasNtlmv2 = (numValue & NTLMV2_SESSION_FLAG) !== 0;
    const has128bit = (numValue & ENCRYPT_128_FLAG) !== 0;
    return !(hasNtlmv2 && has128bit);
  });

  if (hasInsecure && worstSeverity) {
    return createMisconfiguration(
      'ntlm-min-client-sec',
      'NTLM Client Session Security Weak',
      worstDescription,
      worstSeverity,
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured
  return createMisconfiguration(
    'ntlm-min-client-sec',
    'NTLM Client Session Security Strong',
    'NtlmMinClientSec is properly configured with NTLMv2 and 128-bit encryption. Use BloodHound query to verify coverage.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}

// NetBIOS over TCP/IP Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Services\NetBT\Parameters\Interfaces\Tcpip_*\NetbiosOptions
// Value: 0 = Default (DHCP), 1 = Enabled (insecure), 2 = Disabled (secure)
export function detectNetBIOS(report: GPOReport): Misconfiguration {
  const pathPattern = /NetBT\\Parameters\\Interfaces/i;
  const entries = findRegistryEntries(report, pathPattern, 'NetbiosOptions');

  const gposByValue: Record<string, string[]> = {};

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue !== null) {
      const valueKey = String(numValue);
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
    }
  }

  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\NetBT\\Parameters\\Interfaces\\Tcpip_*\\NetbiosOptions';
  const recommendedValue = '2 (disabled)';

  // If no GPOs configure this, NetBIOS uses DHCP setting (often enabled)
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default (DHCP)'];
    return createMisconfiguration(
      'netbios',
      'NetBIOS Not Configured',
      'NetBIOS over TCP/IP not configured via GPO. Uses DHCP setting which often enables NetBIOS, vulnerable to name poisoning attacks.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check if any insecure values exist (0 = DHCP, 1 = Enabled)
  const hasInsecure = Object.keys(gposByValue).some(v => v !== '2');
  if (hasInsecure) {
    return createMisconfiguration(
      'netbios',
      'NetBIOS Enabled',
      'NetBIOS over TCP/IP is enabled. Vulnerable to name poisoning and NBNS spoofing attacks.',
      'medium',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured
  return createMisconfiguration(
    'netbios',
    'NetBIOS Disabled',
    'NetBIOS over TCP/IP is properly disabled. Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}

// mDNS (Multicast DNS) Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Services\Dnscache\Parameters\EnableMDNS
// Value: 0 = Disabled (secure), 1 = Enabled (insecure)
// Default: Enabled on Windows 10 1703+
export function detectMDNS(report: GPOReport): Misconfiguration {
  const pathPattern = /Dnscache\\Parameters/i;
  const entries = findRegistryEntries(report, pathPattern, 'EnableMDNS');

  const gposByValue: Record<string, string[]> = {};

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue !== null) {
      const valueKey = String(numValue);
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
    }
  }

  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\Dnscache\\Parameters\\EnableMDNS';
  const recommendedValue = '0 (disabled)';

  // If no GPOs configure this, mDNS is enabled by default on modern Windows
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default (Enabled)'];
    return createMisconfiguration(
      'mdns',
      'mDNS Enabled (Default)',
      'mDNS (Multicast DNS) not configured via GPO. Enabled by default on Windows 10 1703+, leaks DNS queries to local network.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check if any insecure values exist (1 = enabled)
  const hasInsecure = Object.keys(gposByValue).some(v => v === '1');
  if (hasInsecure) {
    return createMisconfiguration(
      'mdns',
      'mDNS Enabled',
      'mDNS (Multicast DNS) is enabled. DNS queries can leak to local network, potential information disclosure.',
      'medium',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured
  return createMisconfiguration(
    'mdns',
    'mDNS Disabled',
    'mDNS is properly disabled. Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}

// LDAP Client Signing Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Services\LDAP\LDAPClientIntegrity
// Value: 0 = None (insecure), 1 = Negotiate (weak), 2 = Require (secure)
export function detectLDAPClientSigning(report: GPOReport): Misconfiguration {
  const pathPattern = /Services\\LDAP$/i;
  const entries = findRegistryEntries(report, pathPattern, 'LDAPClientIntegrity');

  const gposByValue: Record<string, string[]> = {};

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue !== null) {
      const valueKey = String(numValue);
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
    }
  }

  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\LDAP\\LDAPClientIntegrity';
  const recommendedValue = '2 (require signing)';

  // If no GPOs configure this
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default (Negotiate)'];
    return createMisconfiguration(
      'ldap-client-signing',
      'LDAP Client Signing Not Configured',
      'LDAPClientIntegrity not configured via GPO. Default behavior negotiates but does not require signing.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Check for insecure values
  const hasNone = Object.keys(gposByValue).some(v => v === '0');
  const hasNegotiate = Object.keys(gposByValue).some(v => v === '1');

  if (hasNone) {
    return createMisconfiguration(
      'ldap-client-signing',
      'LDAP Client Signing Disabled',
      'LDAPClientIntegrity=0 (None). LDAP traffic is not signed, vulnerable to man-in-the-middle attacks.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  if (hasNegotiate) {
    return createMisconfiguration(
      'ldap-client-signing',
      'LDAP Client Signing Negotiated',
      'LDAPClientIntegrity=1 (Negotiate). Signing is negotiated but not required, may fall back to unsigned.',
      'medium',
      registryPath,
      recommendedValue,
      gposByValue
    );
  }

  // Properly configured (value 2)
  return createMisconfiguration(
    'ldap-client-signing',
    'LDAP Client Signing Required',
    'LDAP client signing is properly required. Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue
  );
}


// LDAP Server Signing Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Services\NTDS\Parameters\LDAPServerIntegrity
// Value: 1 = None (insecure), 2 = Require Signing (secure)
export function detectLDAPServerSigning(report: GPOReport): Misconfiguration {
  const pathPattern = /NTDS\\Parameters/i;
  const entries = findRegistryEntries(report, pathPattern, 'LDAPServerIntegrity');

  const gposByValue: Record<string, string[]> = {};

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue !== null) {
      const valueKey = String(numValue);
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
    }
  }

  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\NTDS\\Parameters\\LDAPServerIntegrity';
  const recommendedValue = '2 (require signing)';

  // If no GPOs configure this
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default (Negotiate)'];
    return createMisconfiguration(
      'ldap-server-signing',
      'LDAP Server Signing Not Configured',
      'LDAPServerIntegrity not configured via GPO. Default behavior negotiates but does not require signing.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue,
      'domain-controllers'
    );
  }

  // Check for insecure values
  const hasNone = Object.keys(gposByValue).some(v => v === '0');
  const hasNegotiate = Object.keys(gposByValue).some(v => v === '1');

  if (hasNone) {
    return createMisconfiguration(
      'ldap-server-signing',
      'LDAP Server Signing Disabled',
      'LDAPServerIntegrity=0 (None). LDAP traffic is not signed, vulnerable to man-in-the-middle attacks.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue,
      'domain-controllers'
    );
  }

  if (hasNegotiate) {
    return createMisconfiguration(
      'ldap-server-signing',
      'LDAP Server Signing Negotiated',
      'LDAPServerIntegrity=1 (Negotiate). Signing is negotiated but not required, may fall back to unsigned.',
      'medium',
      registryPath,
      recommendedValue,
      gposByValue,
      'domain-controllers'
    );
  }

  // Properly configured (value 2)
  return createMisconfiguration(
    'ldap-server-signing',
    'LDAP Server Signing Required',
    'LDAP server signing is properly required. Use BloodHound query to verify all machines are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue,
    'domain-controllers'
  );
}


// LDAP Channel Binding Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Services\NTDS\Parameters\LdapEnforceChannelBinding
// Value: 0 = Never (insecure), 1 = When Supported (weak), 2 = Always (secure)
// Note: Primarily affects Domain Controllers, protects against LDAP relay attacks
export function detectLDAPChannelBinding(report: GPOReport): Misconfiguration {
  const pathPattern = /NTDS\\Parameters/i;
  const entries = findRegistryEntries(report, pathPattern, 'LdapEnforceChannelBinding');

  const gposByValue: Record<string, string[]> = {};

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue !== null) {
      const valueKey = String(numValue);
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
    }
  }

  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Services\\NTDS\\Parameters\\LdapEnforceChannelBinding';
  const recommendedValue = '2 (always required)';

  // If no GPOs configure this
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default'];
    return createMisconfiguration(
      'ldap-channel-binding',
      'LDAP Channel Binding Not Configured',
      'LdapEnforceChannelBinding not configured via GPO. Domain Controllers default to 0 (Never) until Windows Server 2020 March update.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue,
      'domain-controllers'
    );
  }

  // Check for insecure values
  const hasNever = Object.keys(gposByValue).some(v => v === '0');
  const hasWhenSupported = Object.keys(gposByValue).some(v => v === '1');

  if (hasNever) {
    return createMisconfiguration(
      'ldap-channel-binding',
      'LDAP Channel Binding Disabled',
      'LdapEnforceChannelBinding=0 (Never). Domain Controllers do not require channel binding tokens, vulnerable to LDAP relay attacks.',
      'high',
      registryPath,
      recommendedValue,
      gposByValue,
      'domain-controllers'
    );
  }

  if (hasWhenSupported) {
    return createMisconfiguration(
      'ldap-channel-binding',
      'LDAP Channel Binding Partial',
      'LdapEnforceChannelBinding=1 (When Supported). Channel binding only required when client supports it, can be bypassed.',
      'medium',
      registryPath,
      recommendedValue,
      gposByValue,
      'domain-controllers'
    );
  }

  // Properly configured (value 2)
  return createMisconfiguration(
    'ldap-channel-binding',
    'LDAP Channel Binding Required',
    'LDAP channel binding is properly required. Use BloodHound query to verify all Domain Controllers are covered by these GPOs.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue,
    'domain-controllers'
  );
}

// NtlmMinServerSec Detection
// Registry: HKLM\SYSTEM\CurrentControlSet\Control\Lsa\MSV1_0\NtlmMinServerSec
// Same bitmask logic as client
export function detectNtlmMinServerSec(report: GPOReport): Misconfiguration {
  const pathPattern = /Control\\Lsa\\MSV1_0/i;
  const entries = findRegistryEntries(report, pathPattern, 'NtlmMinServerSec');

  const gposByValue: Record<string, string[]> = {};
  const registryPath = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Lsa\\MSV1_0\\NtlmMinServerSec';
  const recommendedValue = '0x20080000 (NTLMv2 + 128-bit)';
  let worstSeverity: Severity | null = null;
  let worstDescription = '';

  for (const { gpo, value } of entries) {
    const gpoName = gpo.header.gpo || 'Unknown GPO';
    const numValue = parseRegistryValue(value);

    if (numValue === null || numValue === 0) {
      // Value 0 or unparseable = HIGH severity
      const valueKey = '0x0';
      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);
      if (worstSeverity !== 'high') {
        worstSeverity = 'high';
        worstDescription = 'No minimum NTLM session security enforced.';
      }
    } else {
      const hasNtlmv2 = (numValue & NTLMV2_SESSION_FLAG) !== 0;
      const has128bit = (numValue & ENCRYPT_128_FLAG) !== 0;
      const valueKey = `0x${numValue.toString(16)}`;

      if (!gposByValue[valueKey]) gposByValue[valueKey] = [];
      gposByValue[valueKey].push(gpoName);

      if (hasNtlmv2 && has128bit) {
        // Secure - both flags set (no severity change needed)
      } else if (hasNtlmv2 && !has128bit) {
        // MEDIUM - has NTLMv2 but not 128-bit
        if (worstSeverity === null) {
          worstSeverity = 'medium';
          worstDescription = 'Requires NTLMv2 but not 128-bit encryption.';
        }
      } else {
        // HIGH - missing NTLMv2 flag
        if (worstSeverity !== 'high') {
          worstSeverity = 'high';
          worstDescription = 'Does not require NTLMv2 session security.';
        }
      }
    }
  }

  // If no GPOs configure this
  if (Object.keys(gposByValue).length === 0) {
    gposByValue['(Default)'] = ['No GPO - Windows Default'];
    return createMisconfiguration(
      'ntlm-min-server-sec',
      'NTLM Server Session Security Not Configured',
      'NtlmMinServerSec not configured via GPO. Windows defaults may not enforce NTLMv2 or 128-bit encryption.',
      'low',
      registryPath,
      recommendedValue,
      gposByValue,
      'domain-controllers'
    );
  }

  // Check if there are any insecure values (anything not matching secure pattern)
  const hasInsecure = Object.keys(gposByValue).some(valueKey => {
    if (valueKey === '0x0') return true;
    const numValue = parseInt(valueKey.replace('0x', ''), 16);
    const hasNtlmv2 = (numValue & NTLMV2_SESSION_FLAG) !== 0;
    const has128bit = (numValue & ENCRYPT_128_FLAG) !== 0;
    return !(hasNtlmv2 && has128bit);
  });

  if (hasInsecure && worstSeverity) {
    return createMisconfiguration(
      'ntlm-min-server-sec',
      'NTLM Server Session Security Weak',
      worstDescription,
      worstSeverity,
      registryPath,
      recommendedValue,
      gposByValue,
      'domain-controllers'
    );
  }

  // Properly configured
  return createMisconfiguration(
    'ntlm-min-server-sec',
    'NTLM Server Session Security Strong',
    'NtlmMinServerSec is properly configured with NTLMv2 and 128-bit encryption. Use BloodHound query to verify coverage.',
    'info',
    registryPath,
    recommendedValue,
    gposByValue,
    'domain-controllers'
  );
}

// Main detection function - runs all detectors
// All detectors now return findings (including 'info' severity for properly configured settings)
export function detectMisconfigurations(report: GPOReport): Misconfiguration[] {
  const detectors = [
    detectSMBv1Server,
    detectSMBv1Client,
    detectLLMNR,
    detectIPv6,
    detectCachedCredentials,
    detectSMBSigningServer,
    detectSMBSigningClient,
    detectLmCompatibilityLevel,
    detectNoLMHash,
    detectNtlmMinClientSec,
    detectNtlmMinServerSec,
    detectNetBIOS,
    detectMDNS,
    detectLDAPClientSigning,
    detectLDAPServerSigning,
    detectLDAPChannelBinding,
  ];

  return detectors.map(detector => detector(report));
}

