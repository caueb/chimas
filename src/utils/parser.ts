import { SnafflerJsonData, SnafflerEntry, FileResult, ShareResult, CustomFilter } from '../types';

/**
 * Parse the MATCH CONTEXT content to handle escaped characters
 * Enhanced to handle complex Snaffler log patterns
 */
function parseMatchContext(matchContext: string): string {
  if (!matchContext) return '';
  
  try {
    // Handle escape sequences in order of complexity
    let parsed = matchContext
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

/**
 * Remove duplicate entries from the results array
 * Duplicates are identified by the combination of fullPath, rating, and ruleName
 */
function removeDuplicates(results: FileResult[]): FileResult[] {
  const seen = new Set<string>();
  const uniqueResults: FileResult[] = [];
  let duplicateCount = 0;
  const debugMode = false; // Set to true for verbose logging

  for (const result of results) {
    // Create a unique key based on path, rating, and rule
    const uniqueKey = `${result.fullPath}|${result.rating}|${result.ruleName}`;
    
    if (!seen.has(uniqueKey)) {
      seen.add(uniqueKey);
      uniqueResults.push(result);
    } else {
      duplicateCount++;
      if (debugMode) {
        console.log(`Duplicate detected and removed: ${result.fullPath} (${result.rating}) - Rule: ${result.ruleName}`);
      }
    }
  }

  if (duplicateCount > 0) {
    // console.log(`Duplicate detection: ${duplicateCount} duplicates removed (${results.length} → ${uniqueResults.length} files)`);
  }

  return uniqueResults;
}

/**
 * Additional duplicate detection for edge cases
 * This function looks for files with the same path but different ratings/rules
 * and keeps the highest priority rating (Red > Yellow > Green > Black)
 * For files matched by multiple rules, it combines the rule names
 */
function removePriorityDuplicates(results: FileResult[]): FileResult[] {
  const fileMap = new Map<string, FileResult>();
  const priorityOrder = { 'Red': 4, 'Yellow': 3, 'Green': 2, 'Black': 1 };
  let replacedCount = 0;
  let combinedCount = 0;
  const debugMode = false; // Set to true for verbose logging

  for (const result of results) {
    const existing = fileMap.get(result.fullPath);
    
    if (!existing) {
      fileMap.set(result.fullPath, result);
    } else {
      // If we have the same file with different ratings, keep the higher priority one
      const existingPriority = priorityOrder[existing.rating as keyof typeof priorityOrder] || 0;
      const newPriority = priorityOrder[result.rating as keyof typeof priorityOrder] || 0;
      
      if (newPriority > existingPriority) {
        if (debugMode) {
          console.log(`Replacing ${existing.rating} with ${result.rating} for: ${result.fullPath}`);
        }
        fileMap.set(result.fullPath, result);
        replacedCount++;
      } else if (newPriority === existingPriority) {
        // Same priority, combine rule names if they're different
        if (result.ruleName !== existing.ruleName) {
          const combinedRuleName = `${existing.ruleName}, ${result.ruleName}`;
          const updatedResult = { ...existing, ruleName: combinedRuleName };
          fileMap.set(result.fullPath, updatedResult);
          combinedCount++;
          if (debugMode) {
            console.log(`Combined rules for: ${result.fullPath} - ${combinedRuleName}`);
          }
        }
      }
    }
  }

  if (replacedCount > 0 || combinedCount > 0) {
    // console.log(`Priority-based processing: ${replacedCount} files updated to higher priority ratings, ${combinedCount} rule combinations`);
  }

  return Array.from(fileMap.values());
}

export function parseSnafflerJson(jsonData: SnafflerJsonData): { results: FileResult[]; duplicateStats?: any } {
  const results: FileResult[] = [];

  for (const entry of jsonData.entries) {
    if (entry.level === 'Warn' && entry.message.includes('[File]')) {
      const fileResults = parseJsonFileEntry(entry);
      results.push(...fileResults);
    }
  }

  const originalCount = results.length;
  
  // Apply both duplicate detection methods
  const noDuplicates = removeDuplicates(results);
  const finalResults = removePriorityDuplicates(noDuplicates);
  
  const duplicateStats = getDuplicateStats(originalCount, finalResults.length);
  
  return { results: finalResults, duplicateStats };
}

function parseJsonFileEntry(entry: SnafflerEntry): FileResult[] {
  const results: FileResult[] = [];
  const debugMode = false; // Set to true for verbose logging
  
  try {
    // Extract data from eventProperties
    const eventProps = entry.eventProperties;
    
    // Case 1: Check if eventProperties contains structured FileResult data
    if (Object.keys(eventProps).length > 0) {
      // Look for color keys (Red, Green, Yellow, Black) that contain FileResult data
      const colorKeys = ['Red', 'Green', 'Yellow', 'Black'];
      
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
                executable: false, // Not available in this RwStatus object
                deleteable: fileResult.RwStatus.CanModify || false
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

export function parseSnafflerText(textData: string): { results: FileResult[]; duplicateStats?: any } {
  const results: FileResult[] = [];
  const lines = textData.split('\n');

  for (const line of lines) {
    if (line.trim() && line.includes('[File]')) {
      const result = parseTextFileLine(line);
      if (result) {
        results.push(result);
      }
    }
  }

  const originalCount = results.length;
  
  // Apply both duplicate detection methods
  const noDuplicates = removeDuplicates(results);
  const finalResults = removePriorityDuplicates(noDuplicates);
  
  const duplicateStats = getDuplicateStats(originalCount, finalResults.length);
  
  return { results: finalResults, duplicateStats };
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

export function calculateStats(results: FileResult[]): any {
  const stats = {
    total: results.length,
    red: results.filter(r => r.rating === 'Red').length,
    green: results.filter(r => r.rating === 'Green').length,
    yellow: results.filter(r => r.rating === 'Yellow').length,
    black: results.filter(r => r.rating === 'Black').length
  };
  
  return stats;
}

export function parseSnafflerData(data: any, fileType: 'json' | 'text' | 'log'): { results: FileResult[]; duplicateStats?: any } {
  let parseResult: { results: FileResult[]; duplicateStats?: any } | undefined;

  if (fileType === 'json') {
    parseResult = parseSnafflerJson(data);
  } else {
    parseResult = parseSnafflerText(data[0]);
  }

  if (!parseResult || parseResult.results.length === 0) {
    throw new Error('Not a valid Snaffler output file, or the file is empty. Please check the file content and try again.');
  }

  return parseResult;
}

export function parseShareData(data: any, fileType: 'json' | 'text' | 'log'): any[] {
  let shares: any[] = [];
  const shareMap = new Map<string, { 
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
  }>();
  
  // Extract share information from file paths
  let fileResults: FileResult[] = [];
  let shareResults: ShareResult[] = [];
  
  if (fileType === 'json') {
    const parseResult = parseSnafflerJson(data);
    fileResults = parseResult.results;
    shareResults = parseSnafflerShares(data);
  } else {
    const parseResult = parseSnafflerText(data[0]);
    fileResults = parseResult.results;
    shareResults = parseSnafflerSharesText(data[0]);
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
    let aValue: any = a[sortField as keyof FileResult];
    let bValue: any = b[sortField as keyof FileResult];

    // Handle rating sorting (Black > Red > Yellow > Green)
    if (sortField === 'rating') {
      const ratingOrder = { 'Black': 4, 'Red': 3, 'Yellow': 2, 'Green': 1 };
      aValue = ratingOrder[a.rating] || 0;
      bValue = ratingOrder[b.rating] || 0;
    }

    // Handle size sorting (convert to numbers)
    if (sortField === 'size') {
      aValue = parseInt(aValue) || 0;
      bValue = parseInt(bValue) || 0;
    }

    // Handle date sorting
    if (sortField === 'creationTime' || sortField === 'lastModified') {
      aValue = new Date(aValue).getTime();
      bValue = new Date(bValue).getTime();
    }

    // Handle string sorting
    if (typeof aValue === 'string' && typeof bValue === 'string') {
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
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
        // e.g., "cybercx@cybprdocaw001" -> extract just "cybercx"
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
    // Extract data from eventProperties
    const eventProps = entry.eventProperties;
    
    // Look for color keys (Red, Green, Yellow, Black) that contain ShareResult data
    const colorKeys = ['Red', 'Green', 'Yellow', 'Black'];
    
    for (const colorKey of colorKeys) {
      if (eventProps[colorKey] && eventProps[colorKey].ShareResult) {
        const shareResult = eventProps[colorKey].ShareResult;
        
        if (shareResult.SharePath) {
          // Extract system ID and share name from the share path
          const pathMatch = shareResult.SharePath.match(/\\\\([^\\]+)\\([^\\]+)/);
          const systemId = pathMatch ? pathMatch[1] : '';
          const shareName = pathMatch ? pathMatch[2] : '';
          
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

