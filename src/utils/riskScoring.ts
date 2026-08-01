import { FileResult } from '../types';
import { CREDENTIALS_KEYWORDS, SNAFF_CREDS_KEYWORDS } from './constants';
import { safeDateTimestamp } from './parser';

export interface RiskFactor {
  name: string;
  points: number;
  description: string;
}

export interface RiskScore {
  total: number;
  factors: RiskFactor[];
  level: 'critical' | 'high' | 'medium' | 'low';
}

// Executable file extensions that increase risk
const EXECUTABLE_EXTENSIONS = [
  '.exe', '.dll', '.ps1', '.bat', '.cmd', '.vbs', '.js', '.wsf',
  '.msi', '.msp', '.scr', '.com', '.pif', '.hta', '.cpl'
];

// One megabyte in bytes
const ONE_MB = 1024 * 1024;

// Days to consider "recent"
const RECENT_DAYS = 7;

// Configuration file extensions
const CONFIG_EXTENSIONS = [
  '.config', '.conf', '.cfg', '.ini', '.yaml', '.yml',
  '.properties', '.env', '.htaccess', '.htpasswd'
];
const HIGH_VALUE_CONFIG_FILES = ['web.config', 'app.config', 'appsettings.json', 'connectionstrings.config'];

// Sensitive filenames - GPP files get highest score (cPassword vulnerability)
const GPP_FILES = [
  'groups.xml', 'scheduledtasks.xml', 'services.xml',
  'datasources.xml', 'drives.xml', 'printers.xml'
];
const SENSITIVE_FILENAMES = [
  ...GPP_FILES,
  'unattend.xml', 'sysprep.xml', 'sysprep.inf', 'autounattend.xml',
  'web.config', 'applicationhost.config', 'machine.config',
  'bootstrap.ini', 'customsettings.ini',
  'connectionstrings.config', 'database.yml'
];

// Database file extensions
const DATABASE_EXTENSIONS = [
  '.mdb', '.accdb', '.sqlite', '.sqlite3', '.db', '.sdf', '.mdf', '.ldf'
];

// Backup file extensions and patterns
const BACKUP_EXTENSIONS = ['.bak', '.backup', '.old', '.orig', '.save', '.copy', '.tmp'];

// Certificate and key file extensions
const CERT_KEY_EXTENSIONS = [
  '.pfx', '.p12', '.pem', '.key', '.cer', '.crt', '.der',
  '.p7b', '.p7c', '.jks', '.keystore', '.ppk'
];

// Snaffler rule name scoring - keywords that indicate high-value findings
const CRITICAL_RULE_KEYWORDS = [
  'cred', 'password', 'passwd', 'secret', 'key', 'token', 'auth', 'admin',
  'private', 'sensitive', 'confidential'
];
const HIGH_VALUE_RULE_KEYWORDS = [
  'config', 'cert', 'database', 'connection', 'backup', 'script', 'code'
];
const CONTENT_MATCH_RULES = ['KeepExtScanContent', 'KeepExtScanRegex'];

/**
 * Calculate a risk score for a file result based on multiple factors
 * Score ranges from 0-100+, with higher scores indicating higher risk
 */
export function calculateRiskScore(result: FileResult): RiskScore {
  const factors: RiskFactor[] = [];
  let total = 0;

  // Factor 1: Severity rating (base score)
  const severityPoints = getSeverityPoints(result.rating);
  if (severityPoints > 0) {
    factors.push({
      name: 'Severity',
      points: severityPoints,
      description: `${result.rating} severity rating`
    });
    total += severityPoints;
  }

  // Factor 2: Writable file
  if (result.rwStatus?.writable) {
    factors.push({
      name: 'Writable',
      points: 25,
      description: 'File is writable'
    });
    total += 25;
  }

  // Factor 3: Contains credentials keywords
  const credentialScore = getCredentialScore(result);
  if (credentialScore > 0) {
    factors.push({
      name: 'Credentials',
      points: credentialScore,
      description: 'Contains credential-related content'
    });
    total += credentialScore;
  }

  // Factor 4: Recently modified
  const recentScore = getRecencyScore(result.lastModified);
  if (recentScore > 0) {
    factors.push({
      name: 'Recent',
      points: recentScore,
      description: `Modified within ${RECENT_DAYS} days`
    });
    total += recentScore;
  }

  // Factor 5: Executable file
  if (isExecutable(result.fileName)) {
    factors.push({
      name: 'Executable',
      points: 10,
      description: 'Executable or script file'
    });
    total += 10;
  }

  // Factor 6: Large file (potential data store)
  const sizeNum = parseInt(result.size);
  if (!isNaN(sizeNum) && sizeNum > ONE_MB) {
    factors.push({
      name: 'Large File',
      points: 5,
      description: 'File larger than 1MB'
    });
    total += 5;
  }

  // Factor 7: Configuration file
  const configScore = getConfigFileScore(result.fileName);
  if (configScore > 0) {
    factors.push({
      name: 'Config File',
      points: configScore,
      description: configScore >= 15 ? 'High-value config file' : 'Configuration file'
    });
    total += configScore;
  }

  // Factor 10: Sensitive filename
  const sensitiveFilenameScore = getSensitiveFilenameScore(result.fileName);
  if (sensitiveFilenameScore > 0) {
    factors.push({
      name: 'Sensitive Filename',
      points: sensitiveFilenameScore,
      description: sensitiveFilenameScore >= 30 ? 'GPP file (cPassword risk)' : 'Known sensitive file'
    });
    total += sensitiveFilenameScore;
  }

  // Factor 11: Database file
  const databaseScore = getDatabaseFileScore(result.fileName);
  if (databaseScore > 0) {
    factors.push({
      name: 'Database File',
      points: databaseScore,
      description: 'Database file (potential data store)'
    });
    total += databaseScore;
  }

  // Factor 12: Backup file
  const backupScore = getBackupFileScore(result.fileName);
  if (backupScore > 0) {
    factors.push({
      name: 'Backup File',
      points: backupScore,
      description: 'Backup/archive file'
    });
    total += backupScore;
  }

  // Factor 13: Certificate/key file
  const certKeyScore = getCertKeyScore(result.fileName);
  if (certKeyScore > 0) {
    factors.push({
      name: 'Cert/Key File',
      points: certKeyScore,
      description: 'Certificate or private key file'
    });
    total += certKeyScore;
  }

  // Factor 14: Full access combination
  const fullAccessScore = getFullAccessBonus(result.rwStatus);
  if (fullAccessScore > 0) {
    factors.push({
      name: 'Full Access',
      points: fullAccessScore,
      description: 'Read + Write + Delete access'
    });
    total += fullAccessScore;
  }

  // Factor 14: Rule name weighting
  const ruleScore = getRuleNameScore(result.ruleName);
  if (ruleScore > 0) {
    factors.push({
      name: 'Rule Type',
      points: ruleScore,
      description: ruleScore >= 15 ? 'Credential/secret rule match' : 'High-value rule match'
    });
    total += ruleScore;
  }

  return {
    total,
    factors,
    level: getRiskLevel(total)
  };
}

/**
 * Get points based on severity rating
 */
function getSeverityPoints(rating: string): number {
  switch (rating.toLowerCase()) {
    case 'black': return 40;
    case 'red': return 30;
    case 'yellow': return 20;
    case 'green': return 10;
    default: return 0;
  }
}

/**
 * Check if content contains credential keywords and return score
 */
function getCredentialScore(result: FileResult): number {
  const searchText = [
    result.matchContext || '',
    ...(result.matchedStrings || [])
  ].join(' ').toLowerCase();

  const matchedKeywords = CREDENTIALS_KEYWORDS.filter(keyword =>
    searchText.includes(keyword.toLowerCase())
  );

  if (matchedKeywords.length === 0) return 0;

  // if matched keyword in SNAFF_CREDS_KEYWORDS, return 0 points
  const snaffMatched = SNAFF_CREDS_KEYWORDS.filter(keyword =>
    searchText.includes(keyword.toLowerCase())
  );
  if (snaffMatched.length > 0) return 0;

  // Base 20 points for any credential match, +5 for each additional
  return Math.min(20 + (matchedKeywords.length - 1) * 5, 35);
}

/**
 * Check if file was modified recently
 */
function getRecencyScore(lastModified: string): number {
  if (!lastModified) return 0;

  try {
    const timestamp = safeDateTimestamp(lastModified);
    if (timestamp === 0) return 0; // No recency score for invalid dates
    const modDate = new Date(lastModified);
    const now = new Date();
    const daysDiff = (now.getTime() - modDate.getTime()) / (1000 * 60 * 60 * 24);

    if (daysDiff <= RECENT_DAYS) {
      return 15;
    }
  } catch {
    // Invalid date, no points
  }

  return 0;
}

/**
 * Check if file is an executable type
 */
function isExecutable(fileName: string): boolean {
  const lowerName = fileName.toLowerCase();
  return EXECUTABLE_EXTENSIONS.some(ext => lowerName.endsWith(ext));
}

/**
 * Get score for configuration files
 */
function getConfigFileScore(fileName: string): number {
  const lowerName = fileName.toLowerCase();

  // High-value config files
  if (HIGH_VALUE_CONFIG_FILES.some(f => lowerName === f)) {
    return 15;
  }

  // Other config files
  if (CONFIG_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
    return 10;
  }

  return 0;
}

/**
 * Get score for sensitive filenames
 * GPP files get highest score due to cPassword vulnerability
 */
function getSensitiveFilenameScore(fileName: string): number {
  const lowerName = fileName.toLowerCase();

  // GPP files with cPassword vulnerability
  if (GPP_FILES.some(f => lowerName === f)) {
    return 30;
  }

  // Other sensitive files
  if (SENSITIVE_FILENAMES.some(f => lowerName === f)) {
    return 20;
  }

  return 0;
}

/**
 * Get score for database files
 */
function getDatabaseFileScore(fileName: string): number {
  const lowerName = fileName.toLowerCase();
  if (DATABASE_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
    return 15;
  }
  return 0;
}

/**
 * Get score for backup files
 */
function getBackupFileScore(fileName: string): number {
  const lowerName = fileName.toLowerCase();

  // Check for backup extensions
  if (BACKUP_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
    return 10;
  }

  // Check for backup patterns in filename
  if (lowerName.includes('_backup') || lowerName.includes('.backup') ||
      lowerName.includes('_old') || lowerName.includes('.old.')) {
    return 10;
  }

  return 0;
}

/**
 * Get score for certificate and key files
 */
function getCertKeyScore(fileName: string): number {
  const lowerName = fileName.toLowerCase();
  if (CERT_KEY_EXTENSIONS.some(ext => lowerName.endsWith(ext))) {
    return 25;
  }
  return 0;
}

/**
 * Get bonus for full access (read + write + modify)
 */
function getFullAccessBonus(rwStatus: FileResult['rwStatus']): number {
  if (rwStatus?.readable && rwStatus?.writable && rwStatus?.modifyable) {
    return 10;
  }
  return 0;
}

/**
 * Get score based on Snaffler rule name
 * Uses keyword matching to identify high-value rules
 */
function getRuleNameScore(ruleName: string): number {
  if (!ruleName) return 0;

  const lowerRule = ruleName.toLowerCase();

  // Content-matching rules get highest score
  if (CONTENT_MATCH_RULES.some(r => ruleName.includes(r))) {
    return 15;
  }

  // Critical rule keywords (credentials, secrets, etc.)
  if (CRITICAL_RULE_KEYWORDS.some(k => lowerRule.includes(k))) {
    return 15;
  }

  // High-value rule keywords (config, cert, etc.)
  if (HIGH_VALUE_RULE_KEYWORDS.some(k => lowerRule.includes(k))) {
    return 10;
  }

  // No bonus for generic rules
  return 0;
}

/**
 * Determine risk level based on total score
 * Thresholds adjusted for expanded scoring factors
 */
function getRiskLevel(score: number): 'critical' | 'high' | 'medium' | 'low' {
  if (score >= 100) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 35) return 'medium';
  return 'low';
}

/**
 * Get CSS class for risk level
 */
export function getRiskLevelClass(level: RiskScore['level']): string {
  switch (level) {
    case 'critical': return 'risk-critical';
    case 'high': return 'risk-high';
    case 'medium': return 'risk-medium';
    case 'low': return 'risk-low';
  }
}

/**
 * Get color for risk level (for progress bars, etc.)
 * Colors match rating colors
 */
export function getRiskLevelColor(level: RiskScore['level']): string {
  switch (level) {
    case 'critical': return '#792F2F'; // Red (matches dark theme rating)
    case 'high': return '#e67e22';     // Orange
    case 'medium': return '#B0A631';   // Yellow (matches rating)
    case 'low': return '#31B049';      // Green (matches rating)
  }
}
