/**
 * Utility functions for generating exploitation commands from UNC paths
 */

export interface ParsedPath {
  server: string;
  share: string;
  relativePath: string;
  fileName: string;
}

/**
 * Parse a UNC path into its components
 * Example: \\SERVER\SHARE\path\to\file.txt
 */
export function parseUNCPath(fullPath: string): ParsedPath | null {
  // Match \\SERVER\SHARE\optional\path
  const match = fullPath.match(/^\\\\([^\\]+)\\([^\\]+)(?:\\(.*))?$/);
  if (!match) return null;

  const relativePath = match[3] || '';
  const pathParts = relativePath.split('\\');
  const fileName = pathParts[pathParts.length - 1] || '';

  return {
    server: match[1],
    share: match[2],
    relativePath: relativePath,
    fileName: fileName
  };
}

/**
 * Generate smbclient command for Linux
 */
export function generateSmbclientCmd(parsed: ParsedPath): string {
  const remotePath = parsed.relativePath.replace(/\\/g, '/');
  return `smbclient '//${parsed.server}/${parsed.share}' -U 'DOMAIN/user%password' -c 'get "${remotePath}"'`;
}

/**
 * Generate impacket-smbclient command
 */
export function generateImpacketCmd(parsed: ParsedPath): string {
  const remotePath = parsed.relativePath.replace(/\\/g, '/');
  return `impacket-smbclient 'DOMAIN/user:password@${parsed.server}' -c 'use ${parsed.share}; get ${remotePath}'`;
}

/**
 * Generate PowerShell Copy-Item command
 */
export function generatePowerShellCmd(fullPath: string): string {
  return `Copy-Item -Path '${fullPath}' -Destination .\\`;
}

/**
 * Generate PowerShell Get-Content command (for reading file)
 */
export function generatePowerShellReadCmd(fullPath: string): string {
  return `Get-Content -Path '${fullPath}'`;
}

/**
 * Generate Linux CIFS mount command
 */
export function generateMountCmd(parsed: ParsedPath): string {
  return `sudo mount -t cifs '//${parsed.server}/${parsed.share}' /mnt/share -o username=USER,domain=DOMAIN`;
}

/**
 * Generate net use command for Windows
 */
export function generateNetUseCmd(parsed: ParsedPath): string {
  return `net use \\\\${parsed.server}\\${parsed.share} /user:DOMAIN\\USER PASSWORD`;
}

export interface GeneratedCommand {
  name: string;
  description: string;
  command: string;
  icon: string;
}

/**
 * Generate all available commands for a given path
 */
export function generateAllCommands(fullPath: string): GeneratedCommand[] {
  const parsed = parseUNCPath(fullPath);
  if (!parsed) return [];

  return [
    {
      name: 'smbclient',
      description: 'Linux smbclient - download file',
      command: generateSmbclientCmd(parsed),
      icon: 'fa-terminal'
    },
    {
      name: 'impacket',
      description: 'Impacket smbclient - download file',
      command: generateImpacketCmd(parsed),
      icon: 'fa-scroll'
    },
    {
      name: 'PowerShell (Read)',
      description: 'PowerShell - read file contents',
      command: generatePowerShellReadCmd(fullPath),
      icon: 'fa-file-alt'
    },
    {
      name: 'mount (CIFS)',
      description: 'Linux - mount share',
      command: generateMountCmd(parsed),
      icon: 'fa-hdd'
    }
  ];
}
