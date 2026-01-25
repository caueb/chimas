import { SnafflerJsonData, SnafflerEntry, FileResult, ShareResult, CustomFilter, DuplicateStats, Stats, ShareInfo } from '../types';

/**
 * Strip UTF-8 BOM (Byte Order Mark) from string if present.
 * BOM bytes: 0xEF 0xBB 0xBF appear as \uFEFF at start of string
 */
export function stripBOM(content: string): string {
  if (content.charCodeAt(0) === 0xFEFF) {
    return content.slice(1);
  }
  return content;
}

/**
 * Safely parse a date string, returning a fallback for invalid dates.
 * Invalid dates (including "Invalid Date" from new Date()) return the fallback.
 *
 * @param dateString - The date string to parse
 * @param fallback - Value to return if date is invalid (default: '')
 * @returns Parsed date as ISO string, or fallback if invalid
 */
export function safeParseDate(dateString: string | undefined | null, fallback: string = ''): string {
  if (!dateString) return fallback;

  try {
    const date = new Date(dateString);
    // Check if date is valid (Invalid Date returns NaN for getTime())
    if (isNaN(date.getTime())) {
      return fallback;
    }
    return dateString; // Return original string if valid (preserves original format)
  } catch {
    return fallback;
  }
}

/**
 * Safely get timestamp for sorting. Returns 0 for invalid dates.
 * Use this instead of new Date(str).getTime() to prevent NaN in sort comparisons.
 */
export function safeDateTimestamp(dateString: string | undefined | null): number {
  if (!dateString) return 0;

  try {
    const date = new Date(dateString);
    const timestamp = date.getTime();
    return isNaN(timestamp) ? 0 : timestamp;
  } catch {
    return 0;
  }
}

/**
 * Parse the MATCH CONTEXT content to handle escaped characters
 * Enhanced to handle complex Snaffler log patterns and Unicode escapes
 */
function parseMatchContext(matchContext: string): string {
  if (!matchContext) return '';

  try {
    // First, handle Unicode escape sequences (\uXXXX)
    // This must be done before other escape handling
    let parsed = matchContext.replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => {
      return String.fromCharCode(parseInt(hex, 16));
    });

    // Handle escape sequences in order of complexity
    parsed = parsed
      // Handle newlines and carriage returns first
      .replace(/\\r\\n/g, '\n')  // Convert \r\n to actual newlines
      .replace(/\\n/g, '\n')     // Convert \n to actual newlines
      .replace(/\\r/g, '\n')     // Convert \r to newlines

      // Handle tabs and spaces
      .replace(/\\t/g, '\t')     // Convert \t to actual tabs
      .replace(/\\ /g, ' ')      // Convert \ (space) to actual spaces

      // Handle quotes and backslashes
      .replace(/\\"/g, '"')      // Convert \" to actual quotes
      .replace(/\\\\/g, '\\');   // Convert \\ to actual backslashes

    // Only unescape characters that are commonly escaped in text content
    parsed = parsed.replace(/\\([\[\](){}.*+?^$|#<>])/g, '$1');

    // Clean up excessive whitespace while preserving newlines
    parsed = parsed
      .replace(/\n\s*\n/g, '\n')  // Remove empty lines
      .trim();

    return parsed;
  } catch (error) {
    console.error('Error parsing match context:', error);
    return matchContext; // Return original if parsing fails
  }
}

// Type for eventProperties color key structure
interface ColorKeyData {
  FileResult?: {
    FileInfo?: {
      FullName?: string;
      Name?: string;
      CreationTime?: string;
      CreationTimeUtc?: string;
      LastWriteTime?: string;
      LastWriteTimeUtc?: string;
      LastAccessTime?: string;
      LastAccessTimeUtc?: string;
      Length?: number;
    };
    TextResult?: {
      MatchContext?: string;
      MatchedStrings?: string[];
    };
    MatchedRule?: {
      RuleName?: string;
      Triage?: string;
    };
    RwStatus?: {
      CanRead?: boolean;
      CanWrite?: boolean;
      CanModify?: boolean;
    };
  };
  ShareResult?: {
    SharePath?: string;
    ShareComment?: string;
    ShareName?: string;      // Direct field (may be present)
    SystemId?: string;       // Direct field (may be present)
    Listable?: boolean;
    RootWritable?: boolean;
    RootReadable?: boolean;
    RootModifyable?: boolean;
    Snaffle?: boolean;
    ScanShare?: boolean;
    Triage?: string;
  };
}

// Type for eventProperties
interface EventProperties {
  Red?: ColorKeyData;
  Green?: ColorKeyData;
  Yellow?: ColorKeyData;
  Black?: ColorKeyData;
  [key: string]: ColorKeyData | undefined;
}

export function parseSnafflerJson(jsonData: SnafflerJsonData): { results: FileResult[]; duplicateStats?: DuplicateStats } {
  const results: FileResult[] = [];
  const seenEntries = new Set<string>();

  for (const entry of jsonData.entries) {
    if (entry.level === 'Warn' && entry.message.includes('[File]')) {
      const fileResults = parseJsonFileEntry(entry);
      
      for (const result of fileResults) {
        // Create a unique key for this entry based on all properties
        // This ensures we only deduplicate entries that are completely identical
        const entryKey = `${result.fullPath}|${result.ruleName}|${result.matchContext}|${result.creationTime}|${result.lastModified}|${result.rating}|${result.size}`;
        
        // Only add if we haven't seen this exact entry before
        if (!seenEntries.has(entryKey)) {
          seenEntries.add(entryKey);
          results.push(result);
        }
      }
    }
  }

  return { results, duplicateStats: undefined };
}

function parseJsonFileEntry(entry: SnafflerEntry): FileResult[] {
  const results: FileResult[] = [];
  const debugMode = false; // Set to true for verbose logging

  try {
    // Extract data from eventProperties (cast to typed interface)
    const eventProps = entry.eventProperties as EventProperties;

    // Case 1: Check if eventProperties contains structured FileResult data
    if (Object.keys(eventProps).length > 0) {
      // Look for color keys (Red, Green, Yellow, Black) that contain FileResult data
      const colorKeys: Array<'Red' | 'Green' | 'Yellow' | 'Black'> = ['Red', 'Green', 'Yellow', 'Black'];
      
      for (const colorKey of colorKeys) {
        if (eventProps[colorKey] && eventProps[colorKey].FileResult) {
          const fileResult = eventProps[colorKey].FileResult;
          
          if (fileResult.FileInfo && fileResult.TextResult && fileResult.MatchedRule) {
            // Parse the match context to handle escaped characters
            const rawMatchContext = fileResult.TextResult.MatchContext || '';
            const parsedMatchContext = parseMatchContext(rawMatchContext);
            
            // Use UTC timestamps if available, fall back to regular timestamps
            const creationTime = fileResult.FileInfo.CreationTimeUtc || fileResult.FileInfo.CreationTime || '';
            const lastModified = fileResult.FileInfo.LastWriteTimeUtc || fileResult.FileInfo.LastWriteTime || '';
            
            const result: FileResult = {
              rating: colorKey as 'Red' | 'Green' | 'Yellow' | 'Black',
              fullPath: fileResult.FileInfo.FullName || '',
              fileName: fileResult.FileInfo.Name || '',
              creationTime: creationTime,
              lastModified: lastModified,
              size: fileResult.FileInfo.Length?.toString() || '0',
              matchContext: parsedMatchContext,
              ruleName: fileResult.MatchedRule.RuleName || '',
              matchedStrings: fileResult.TextResult.MatchedStrings || [],
              triage: fileResult.MatchedRule.Triage || '',
              rwStatus: fileResult.RwStatus ? {
                readable: fileResult.RwStatus.CanRead || false,
                writable: fileResult.RwStatus.CanWrite || false,
                modifyable: fileResult.RwStatus.CanModify || false
              } : undefined
            };
            
            // Debug logging for timestamps
            if (debugMode) {
              console.log(`Processing entry: ${result.fullPath} (${result.rating}) - Rule: ${result.ruleName}`);
              console.log(`  Raw CreationTime: "${fileResult.FileInfo.CreationTime}"`);
              console.log(`  Raw CreationTimeUtc: "${fileResult.FileInfo.CreationTimeUtc}"`);
              console.log(`  Raw LastWriteTime: "${fileResult.FileInfo.LastWriteTime}"`);
              console.log(`  Raw LastWriteTimeUtc: "${fileResult.FileInfo.LastWriteTimeUtc}"`);
              console.log(`  Raw LastAccessTime: "${fileResult.FileInfo.LastAccessTime}"`);
              console.log(`  Raw LastAccessTimeUtc: "${fileResult.FileInfo.LastAccessTimeUtc}"`);
              console.log(`  Using CreationTime: "${result.creationTime}"`);
              console.log(`  Using LastModified: "${result.lastModified}"`);
              
              // Validate timestamp logic
              if (creationTime && lastModified) {
                try {
                  const creationDate = new Date(creationTime);
                  const modifiedDate = new Date(lastModified);
                  
                  if (creationDate > modifiedDate) {
                    console.warn(`⚠️  SUSPICIOUS TIMESTAMPS: Creation time (${creationTime}) is after last modified time (${lastModified}) for file: ${result.fullPath}`);
                    console.warn(`   This could indicate file manipulation, data recovery, or file system inconsistencies.`);
                    
                    // Check if this might be a backup file or archive
                    if (result.fileName.toLowerCase().includes('.bak') || 
                        result.fileName.toLowerCase().includes('.backup') ||
                        result.fileName.toLowerCase().includes('.archive')) {
                      console.info(`   Note: This appears to be a backup file, which might explain the timestamp anomaly.`);
                    }
                    
                    // Check if the file is in an archive directory
                    if (result.fullPath.toLowerCase().includes('archive') ||
                        result.fullPath.toLowerCase().includes('backup')) {
                      console.info(`   Note: File is in an archive/backup directory, which might explain the timestamp anomaly.`);
                    }
                  }
                  
                  // Check for other suspicious patterns
                  const timeDiff = Math.abs(creationDate.getTime() - modifiedDate.getTime());
                  const timeDiffMinutes = timeDiff / (1000 * 60);
                  
                  if (timeDiffMinutes < 5) {
                    console.info(`   Note: Creation and modification times are very close (${timeDiffMinutes.toFixed(1)} minutes apart).`);
                  }
                  
                } catch (dateError) {
                  console.error(`Error parsing dates for ${result.fullPath}:`, dateError);
                }
              }
            }
            
            results.push(result);
          }
        }
      }
    }
    
    // Case 2: If eventProperties is empty, try to parse the message field as a TXT format line
    if (Object.keys(eventProps).length === 0 && entry.message.includes('[File]')) {
      try {
        // Parse the message field using the same logic as parseTextFileLine
        const result = parseTextFileLine(entry.message);
        if (result) {
          results.push(result);
        }
      } catch (error) {
        console.error('Error parsing message field as TXT format:', error);
      }
    }
    
  } catch (error) {
    console.error('Error parsing JSON file entry:', error);
  }

  return results;
}

export function parseSnafflerText(textData: string): { results: FileResult[]; duplicateStats?: DuplicateStats } {
  const results: FileResult[] = [];
  const seenEntries = new Set<string>();
  const lines = textData.split('\n');

  for (const line of lines) {
    if (line.trim() && line.includes('[File]')) {
      const result = parseTextFileLine(line);
      if (result) {
        // Create a unique key for this entry based on all properties
        // This ensures we only deduplicate entries that are completely identical
        const entryKey = `${result.fullPath}|${result.ruleName}|${result.matchContext}|${result.creationTime}|${result.lastModified}|${result.rating}|${result.size}`;
        
        // Only add if we haven't seen this exact entry before
        if (!seenEntries.has(entryKey)) {
          seenEntries.add(entryKey);
          results.push(result);
        }
      }
    }
  }

  return { results, duplicateStats: undefined };
}

function parseTextFileLine(line: string): FileResult | null {
  try {
    
    // Extract user context from the beginning
    const userContextMatch = line.match(/^\[([^\]]+)\]/);
    const userContext = userContextMatch ? userContextMatch[1] : '';
    
    // Extract rating using regex lookbehind/lookahead (similar to Python approach)
    const ratingMatch = line.match(/(?<=\{)(.*?)(?=\})/);
    if (!ratingMatch) return null;
    const rating = ratingMatch[1] as 'Red' | 'Green' | 'Yellow' | 'Black';
    
    // Extract full path using regex lookbehind/lookahead
    const fullPathMatch = line.match(/(?<=>\()(.*?)(?=\))/);
    if (!fullPathMatch) return null;
    const fullPath = fullPathMatch[1];
    
    // Extract creation time using regex (similar to Python approach)
    const creationTimeMatch = line.match(/^.*\|(\d{4}\-(0?[1-9]|1[012])\-(0?[1-9]|[12][0-9]|3[01]) .*?Z)/);
    const lastModified = creationTimeMatch ? creationTimeMatch[1] : '';
    
    // Extract file name from the full path
    const pathParts = fullPath.split('\\');
    const fileName = pathParts[pathParts.length - 1] || '';
    
    // Extract rule name from the rule details section
    const ruleDetailsMatch = line.match(/(?<=\<)(.*?)(?=\>)/);
    let ruleName = '';
    let size = '';
    let matchContext = '';
    
    if (ruleDetailsMatch) {
      const ruleDetails = ruleDetailsMatch[1];
      const ruleParts = ruleDetails.split('|');
      if (ruleParts.length >= 1) {
        ruleName = ruleParts[0];
      }
      
      // Try to extract size from the rule details
      // Look for size pattern in the rule details
      const sizeMatch = ruleDetails.match(/(\d+(?:\.\d+)?(?:B|kB|MB|GB))/);
      if (sizeMatch) {
        size = sizeMatch[1];
      }
    }
    
    // Extract everything after the closing parenthesis - this contains the match context
    // We need to be more specific about which closing parenthesis to capture after
    // Look for the pattern: >(path) match_context
    const pathEndMatch = line.match(/(?<=>\()(.*?)(?=\))/);
    if (pathEndMatch) {
      const pathEndIndex = line.indexOf(pathEndMatch[0], line.indexOf('>('));
      if (pathEndIndex !== -1) {
        const afterPath = line.substring(pathEndIndex + pathEndMatch[0].length + 1); // +1 for the closing parenthesis
        if (afterPath) {
          matchContext = parseMatchContext(afterPath.trim());
        }
      }
    }
    
    return {
      rating,
      fullPath,
      fileName,
      creationTime: lastModified,
      lastModified,
      size,
      matchContext,
      ruleName,
      matchedStrings: [matchContext],
      triage: rating,
      userContext
    };
  } catch (error) {
    console.error('Error parsing text file line:', error, 'Line:', line.substring(0, 100) + '...');
  }

  return null;
}

export function calculateStats(results: FileResult[]): Stats {
  const stats: Stats = {
    total: results.length,
    red: results.filter(r => r.rating === 'Red').length,
    green: results.filter(r => r.rating === 'Green').length,
    yellow: results.filter(r => r.rating === 'Yellow').length,
    black: results.filter(r => r.rating === 'Black').length
  };

  return stats;
}

export function parseSnafflerData(data: SnafflerJsonData | string | string[], fileType: 'json' | 'text' | 'log'): { results: FileResult[]; duplicateStats?: DuplicateStats } {
  let parseResult: { results: FileResult[]; duplicateStats?: DuplicateStats } | undefined;

  if (fileType === 'json') {
    parseResult = parseSnafflerJson(data as SnafflerJsonData);
  } else {
    const textData = Array.isArray(data) ? data[0] : data;
    parseResult = parseSnafflerText(textData as string);
  }

  if (!parseResult) {
    throw new Error('Not a valid Snaffler output file. Please check the file content and try again.');
  }
  // Return empty results if no findings - this is valid (clean environment)
  return parseResult;
}

// Internal share map entry type
interface ShareMapEntry {
  systemId: string;
  shareName: string;
  fileCount: number;
  permissions: Set<string>;
  shareComment: string;
  listable: boolean;
  rootWritable: boolean;
  rootReadable: boolean;
  rootModifyable: boolean;
  snaffle: boolean;
  scanShare: boolean;
  rating: string;
}

export function parseShareData(data: SnafflerJsonData | string | string[], fileType: 'json' | 'text' | 'log'): ShareInfo[] {
  const shares: ShareInfo[] = [];
  const shareMap = new Map<string, ShareMapEntry>();

  // Extract share information from file paths
  let fileResults: FileResult[] = [];
  let shareResults: ShareResult[] = [];

  if (fileType === 'json') {
    const parseResult = parseSnafflerJson(data as SnafflerJsonData);
    fileResults = parseResult.results;
    shareResults = parseSnafflerShares(data as SnafflerJsonData);
  } else {
    const textData = Array.isArray(data) ? data[0] : data;
    const parseResult = parseSnafflerText(textData as string);
    fileResults = parseResult.results;
    shareResults = parseSnafflerSharesText(textData as string);
  }
  
  // First, process direct share entries from [Share] logs
  shareResults.forEach(share => {
    const shareKey = `${share.systemId}\\${share.shareName}`;
    
    if (!shareMap.has(shareKey)) {
      shareMap.set(shareKey, {
        systemId: share.systemId,
        shareName: share.shareName,
        fileCount: 0,
        permissions: new Set(),
        shareComment: share.shareComment,
        listable: share.listable,
        rootWritable: share.rootWritable,
        rootReadable: share.rootReadable,
        rootModifyable: share.rootModifyable,
        snaffle: share.snaffle,
        scanShare: share.scanShare,
        rating: share.rating
      });
    }
    
    const existingShare = shareMap.get(shareKey)!;
    
    // Update permissions based on share properties
    if (share.rootReadable) existingShare.permissions.add('Read');
    if (share.rootWritable) existingShare.permissions.add('Write');
    if (share.rootModifyable) existingShare.permissions.add('Modify');
    
    // Update other properties if they're more detailed
    if (share.shareComment && !existingShare.shareComment) {
      existingShare.shareComment = share.shareComment;
    }
  });
  
  // Then, process each file to extract additional share information
  fileResults.forEach(file => {
    const pathMatch = file.fullPath.match(/\\\\([^\\]+)\\([^\\]+)/);
    if (pathMatch) {
      const systemId = pathMatch[1];
      const shareName = pathMatch[2];
      const shareKey = `${systemId}\\${shareName}`;
      
      if (!shareMap.has(shareKey)) {
        shareMap.set(shareKey, {
          systemId,
          shareName,
          fileCount: 0,
          permissions: new Set(),
          shareComment: '',
          listable: false,
          rootWritable: false,
          rootReadable: false,
          rootModifyable: false,
          snaffle: false,
          scanShare: false,
          rating: 'Unknown'
        });
      }
      
      const share = shareMap.get(shareKey)!;
      share.fileCount++;
      
      // Try to determine permissions from the file path or other indicators
      // For now, we'll assume read access since we can see the files
      share.permissions.add('Read');
    }
  });
  
  // Convert map to array
  shareMap.forEach((share, key) => {
    shares.push({
      systemId: share.systemId,
      shareName: share.shareName,
      permissions: Array.from(share.permissions).join(', '),
      fileCount: share.fileCount,
      path: key,
      shareComment: share.shareComment,
      listable: share.listable,
      rootWritable: share.rootWritable,
      rootReadable: share.rootReadable,
      rootModifyable: share.rootModifyable,
      snaffle: share.snaffle,
      scanShare: share.scanShare,
      rating: share.rating
    });
  });
  
  // Sort by file count (most files first), then by rating priority
  shares.sort((a, b) => {
    if (b.fileCount !== a.fileCount) {
      return b.fileCount - a.fileCount;
    }
    
    // If file counts are equal, sort by rating priority
    const ratingOrder = { 'Red': 4, 'Yellow': 3, 'Green': 2, 'Black': 1, 'Unknown': 0 };
    const aPriority = ratingOrder[a.rating as keyof typeof ratingOrder] || 0;
    const bPriority = ratingOrder[b.rating as keyof typeof ratingOrder] || 0;
    
    return bPriority - aPriority;
  });
  
  return shares;
}

// Helper function to extract and normalize system identifiers
export function extractSystemIdentifier(identifier: string): {
  type: 'ip' | 'hostname' | 'fqdn' | 'unknown';
  value: string;
  displayName: string;
} {
  // Check if it's an IP address
  const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
  if (ipRegex.test(identifier)) {
    return {
      type: 'ip',
      value: identifier,
      displayName: identifier
    };
  }
  
  // Check if it's a fully qualified domain name (contains dots and is not just a hostname)
  const fqdnRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (fqdnRegex.test(identifier) && identifier.includes('.') && identifier.split('.').length >= 2) {
    return {
      type: 'fqdn',
      value: identifier,
      displayName: identifier
    };
  }
  
  // Check if it's a simple hostname (no dots, alphanumeric and hyphens)
  const hostnameRegex = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
  if (hostnameRegex.test(identifier) && !identifier.includes('.')) {
    return {
      type: 'hostname',
      value: identifier,
      displayName: identifier
    };
  }
  
  // Unknown format
  return {
    type: 'unknown',
    value: identifier,
    displayName: identifier
  };
}

// Test function to verify system identifier extraction
export function testSystemIdentifierExtraction() {
  const testCases = [
    '192.168.1.100',
    'DESKTOP-ABC123',
    'server.example.com',
    'invalid-identifier',
    '10.0.0.1',
    'WORKSTATION-123',
    'domain.local'
  ];

  testCases.forEach(testCase => {
    const result = extractSystemIdentifier(testCase);
    console.log(`${testCase} -> ${result.type}: ${result.value} (${result.displayName})`);
  });
}

export function filterResults(
  results: FileResult[],
  ratingFilter: string[],
  searchFilter: string,
  customFilters: CustomFilter[]
): FileResult[] {
  let filtered = results;

  // Filter by rating
  if (!ratingFilter.includes('all')) {
    filtered = filtered.filter(result => 
      ratingFilter.includes(result.rating.toLowerCase())
    );
  }

  // Filter by search term
  if (searchFilter.trim()) {
    const searchTerm = searchFilter.toLowerCase();
    filtered = filtered.filter(result =>
      result.fileName.toLowerCase().includes(searchTerm) ||
      result.fullPath.toLowerCase().includes(searchTerm) ||
      result.ruleName.toLowerCase().includes(searchTerm) ||
      result.matchContext.toLowerCase().includes(searchTerm) ||
      result.matchedStrings.some(str => str.toLowerCase().includes(searchTerm))
    );
  }

  // Filter by custom exclude filters
  if (customFilters.length > 0) {
    filtered = filtered.filter(result => {
      const resultText = [
        result.fileName,
        result.fullPath,
        result.ruleName,
        result.matchContext,
        ...result.matchedStrings
      ].join(' ').toLowerCase();
      
      // Exclude if any custom filter text is found in the result
      return !customFilters.some(filter => 
        resultText.includes(filter.text.toLowerCase())
      );
    });
  }

  return filtered;
}

export function sortResults(
  results: FileResult[],
  sortField: string,
  sortDirection: string
): FileResult[] {
  const sorted = [...results].sort((a, b) => {
    let aValue: string | number = '';
    let bValue: string | number = '';

    // Handle rating sorting (Black > Red > Yellow > Green)
    if (sortField === 'rating') {
      const ratingOrder: Record<string, number> = { 'Black': 4, 'Red': 3, 'Yellow': 2, 'Green': 1 };
      aValue = ratingOrder[a.rating] || 0;
      bValue = ratingOrder[b.rating] || 0;
    }
    // Handle size sorting (convert to numbers)
    else if (sortField === 'size') {
      aValue = parseInt(a.size) || 0;
      bValue = parseInt(b.size) || 0;
    }
    // Handle date sorting
    else if (sortField === 'creationTime' || sortField === 'lastModified') {
      const aDate = sortField === 'creationTime' ? a.creationTime : a.lastModified;
      const bDate = sortField === 'creationTime' ? b.creationTime : b.lastModified;
      aValue = safeDateTimestamp(aDate);
      bValue = safeDateTimestamp(bDate);
    }
    // Handle string sorting for other fields
    else {
      const rawA = a[sortField as keyof FileResult];
      const rawB = b[sortField as keyof FileResult];
      aValue = typeof rawA === 'string' ? rawA.toLowerCase() : String(rawA || '').toLowerCase();
      bValue = typeof rawB === 'string' ? rawB.toLowerCase() : String(rawB || '').toLowerCase();
    }

    if (aValue < bValue) return sortDirection === 'asc' ? -1 : 1;
    if (aValue > bValue) return sortDirection === 'asc' ? 1 : -1;
    return 0;
  });

  return sorted;
} 

// Helper function to extract user information from text logs
export function extractUserInfo(results: FileResult[]): {
  users: Array<{ user: string; machine: string; count: number }>;
  totalUsers: number;
  totalMachines: number;
} {
  const userMap = new Map<string, { user: string; machine: string; count: number }>();
  
  results.forEach(result => {
    if (result.userContext) {
      
      const parts = result.userContext.split('\\');
      if (parts.length >= 2) {
        const machine = parts[0];
        let user = parts[1];
        
        // Handle case where user part contains additional @machine suffix
        if (user.includes('@')) {
          user = user.split('@')[0];
        }
        
        const key = `${machine}\\${user}`;
        
        if (!userMap.has(key)) {
          userMap.set(key, { user, machine, count: 0 });
        }
        userMap.get(key)!.count++;
      }
    }
  });
  
  const users = Array.from(userMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  
  const uniqueMachines = new Set(users.map(u => u.machine));
  
  return {
    users,
    totalUsers: userMap.size,
    totalMachines: uniqueMachines.size
  };
}

/**
 * Get duplicate statistics for reporting
 */
export function getDuplicateStats(originalCount: number, finalCount: number): {
  originalCount: number;
  finalCount: number;
  duplicatesRemoved: number;
  duplicatePercentage: number;
} {
  const duplicatesRemoved = originalCount - finalCount;
  const duplicatePercentage = originalCount > 0 ? (duplicatesRemoved / originalCount) * 100 : 0;
  
  return {
    originalCount,
    finalCount,
    duplicatesRemoved,
    duplicatePercentage: Math.round(duplicatePercentage * 100) / 100
  };
}

/**
 * Parse [Share] entries from Snaffler JSON output
 */
export function parseSnafflerShares(jsonData: SnafflerJsonData): ShareResult[] {
  const results: ShareResult[] = [];

  for (const entry of jsonData.entries) {
    if (entry.level === 'Warn' && entry.message.includes('[Share]')) {
      const shareResults = parseJsonShareEntry(entry);
      results.push(...shareResults);
    }
  }

  return results;
}

/**
 * Parse a single [Share] entry from JSON
 */
function parseJsonShareEntry(entry: SnafflerEntry): ShareResult[] {
  const results: ShareResult[] = [];
  const debugMode = false; // Set to true for verbose logging

  try {
    // Extract data from eventProperties (cast to typed interface)
    const eventProps = entry.eventProperties as EventProperties;

    // Look for color keys (Red, Green, Yellow, Black) that contain ShareResult data
    const colorKeys: Array<'Red' | 'Green' | 'Yellow' | 'Black'> = ['Red', 'Green', 'Yellow', 'Black'];

    for (const colorKey of colorKeys) {
      const colorData = eventProps[colorKey];
      if (colorData && colorData.ShareResult) {
        const shareResult = colorData.ShareResult;

        if (shareResult.SharePath) {
          // Prefer direct fields if available, fall back to regex extraction from path
          let systemId = shareResult.SystemId || '';
          let shareName = shareResult.ShareName || '';

          // Fall back to regex extraction if direct fields not present
          if (!systemId || !shareName) {
            const pathMatch = shareResult.SharePath?.match(/\\\\([^\\]+)\\([^\\]+)/);
            if (pathMatch) {
              systemId = systemId || pathMatch[1];
              shareName = shareName || pathMatch[2];
            }
          }

          const result: ShareResult = {
            rating: colorKey as 'Red' | 'Green' | 'Yellow' | 'Black',
            sharePath: shareResult.SharePath || '',
            shareName: shareName,
            systemId: systemId,
            shareComment: shareResult.ShareComment || '',
            listable: shareResult.Listable || false,
            rootWritable: shareResult.RootWritable || false,
            rootReadable: shareResult.RootReadable || false,
            rootModifyable: shareResult.RootModifyable || false,
            snaffle: shareResult.Snaffle || false,
            scanShare: shareResult.ScanShare || false,
            triage: shareResult.Triage || colorKey
          };
          
          // Log the entry being processed for debugging
          if (debugMode) {
            console.log(`Processing share entry: ${result.sharePath} (${result.rating}) - Comment: ${result.shareComment}`);
          }
          
          results.push(result);
        }
      }
    }
  } catch (error) {
    console.error('Error parsing JSON share entry:', error);
  }

  return results;
}

/**
 * Parse [Share] entries from Snaffler text output
 */
export function parseSnafflerSharesText(textData: string): ShareResult[] {
  const results: ShareResult[] = [];
  const lines = textData.split('\n');

  for (const line of lines) {
    if (line.trim() && line.includes('[Share]')) {
      const result = parseTextShareLine(line);
      if (result) {
        results.push(result);
      }
    }
  }

  return results;
}

/**
 * Parse a single [Share] line from text format
 */
function parseTextShareLine(line: string): ShareResult | null {
  try {
    
    // Extract user context from the beginning
    const userContextMatch = line.match(/^\[([^\]]+)\]/);
    const userContext = userContextMatch ? userContextMatch[1] : '';
    
    // Find the [Share] marker and extract everything after it
    const shareMarkerIndex = line.indexOf('[Share]');
    if (shareMarkerIndex === -1) return null;
    
    const shareSection = line.substring(shareMarkerIndex + 7).trim();
    
    // Extract rating (Red, Green, Yellow, Black)
    const ratingMatch = shareSection.match(/^\{(\w+)\}/);
    if (!ratingMatch) return null;
    const rating = ratingMatch[1] as 'Red' | 'Green' | 'Yellow' | 'Black';
    
    // Extract the share details section between < and >
    const shareStartIndex = shareSection.indexOf('<');
    const shareEndIndex = shareSection.indexOf('>');
    if (shareStartIndex === -1 || shareEndIndex === -1) return null;
    
    const shareDetails = shareSection.substring(shareStartIndex + 1, shareEndIndex);
    
    // Parse the share details
    const shareParts = shareDetails.split('|');
    let shareName = '';
    let shareType = '';
    let sharePath = '';
    
    if (shareParts.length >= 3) {
      shareName = shareParts[0] || '';
      shareType = shareParts[1] || '';
      sharePath = shareParts[2] || '';
    }
    
    // Extract system ID and share name from the share path
    const pathMatch = sharePath.match(/\\\\([^\\]+)\\([^\\]+)/);
    const systemId = pathMatch ? pathMatch[1] : '';
    const extractedShareName = pathMatch ? pathMatch[2] : shareName;
    
    // Extract share comment - everything after the closing parenthesis
    const afterShare = shareSection.substring(shareEndIndex + 1).trim();
    let shareComment = '';
    
    if (afterShare) {
      // Remove any trailing permissions indicator like (R)
      shareComment = afterShare.replace(/\([RWMF]\)$/, '').trim();
    }
    
    // Determine permissions from the share type and trailing indicators
    let listable = false;
    let rootWritable = false;
    let rootReadable = false;
    let rootModifyable = false;
    let snaffle = false;
    let scanShare = false;
    
    // Parse permissions from trailing indicators
    const permMatch = afterShare.match(/\(([RWMF]+)\)$/);
    if (permMatch) {
      const perms = permMatch[1];
      rootReadable = perms.includes('R');
      rootWritable = perms.includes('W');
      rootModifyable = perms.includes('M');
      // F might indicate full access or other flags
    }
    
    // Default assumptions based on share type
    if (shareType === 'R') {
      rootReadable = true;
      listable = true;
    }
    
    return {
      rating,
      sharePath,
      shareName: extractedShareName,
      systemId,
      shareComment,
      listable,
      rootWritable,
      rootReadable,
      rootModifyable,
      snaffle,
      scanShare,
      triage: rating,
      userContext
    };
  } catch (error) {
    console.error('Error parsing text share line:', error);
  }

  return null;
}
