import { SnafflerJsonData, SnafflerEntry, FileResult, ShareResult, CustomFilter, DuplicateStats, Stats, ShareInfo, SnafflerParseOutput } from '../types';

/** Avoid JSON.parse() of a single in-memory document above this size. */
export const LARGE_JSON_PARSE_LIMIT = 8 * 1024 * 1024;

/** Keep match snippets bounded so a single noisy event cannot blow memory. */
export const MAX_MATCH_CONTEXT_CHARS = 32 * 1024;

function limitMatchContext(value: string): string {
  if (!value || value.length <= MAX_MATCH_CONTEXT_CHARS) return value;
  return value.slice(0, MAX_MATCH_CONTEXT_CHARS) + '\n…[truncated]';
}

/** Yield to the browser event loop so the spinner can paint and the tab stays responsive. */
export function yieldToUi(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

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

/** Accumulator used by both the sync parser and the streaming file processor. */
export interface SnafflerParseAccumulator {
  results: FileResult[];
  shareResults: ShareResult[];
  seenFiles: Set<string>;
  jsonObjectsParsed: number;
}

export function createSnafflerAccumulator(): SnafflerParseAccumulator {
  return {
    results: [],
    shareResults: [],
    seenFiles: new Set<string>(),
    jsonObjectsParsed: 0,
  };
}

function makeFileDedupKey(result: FileResult): string {
  // Avoid storing the full matchContext (can be huge) in the dedup set.
  const ctx = result.matchContext || '';
  return `${result.fullPath}\0${result.ruleName}\0${result.rating}\0${result.size}\0${ctx.length}\0${ctx.slice(0, 80)}`;
}

function addFileResult(acc: SnafflerParseAccumulator, result: FileResult): void {
  const key = makeFileDedupKey(result);
  if (acc.seenFiles.has(key)) return;
  acc.seenFiles.add(key);
  acc.results.push(result);
}

/**
 * Accept Snaffler's wrapped `{entries: [...]}`, a raw array, or a single entry object.
 */
export function normalizeJsonEntries(data: unknown): SnafflerEntry[] {
  if (!data) return [];
  if (Array.isArray(data)) return data as SnafflerEntry[];
  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    if (Array.isArray(obj.entries)) return obj.entries as SnafflerEntry[];
    if (
      typeof obj.message === 'string' ||
      typeof obj.level === 'string' ||
      obj.eventProperties
    ) {
      return [data as SnafflerEntry];
    }
  }
  return [];
}

function looksLikeJsonObjectLine(line: string): boolean {
  const s = line.trim();
  return s.startsWith('{') && s.length > 2;
}

/**
 * Parse one NDJSON / FixJSONOutput line into a Snaffler entry.
 * Handles trailing commas and the `{ "entries": [` / `]}` wrapper lines.
 */
export function tryParseJsonLine(line: string): SnafflerEntry | null {
  let s = line.trim();
  if (!s) return null;
  if (s === '{' || s === '}' || s === '[' || s === ']' || s === '],' || s === ']}' || s === '},') {
    return null;
  }
  if (s.startsWith('{"entries"') || s.startsWith('{ "entries"') || s === '{"entries": [') {
    return null;
  }
  if (s.endsWith(',')) s = s.slice(0, -1);
  if (!s.startsWith('{') || !s.endsWith('}')) return null;
  try {
    const parsed = JSON.parse(s);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    return parsed as SnafflerEntry;
  } catch {
    return null;
  }
}

export function ingestSnafflerEntry(acc: SnafflerParseAccumulator, entry: SnafflerEntry): void {
  acc.jsonObjectsParsed++;
  if (!entry || typeof entry !== 'object') return;

  const message = typeof entry.message === 'string' ? entry.message : '';
  const isFile = message.includes('[File]');
  const isShare = message.includes('[Share]');

  // Structured eventProperties (typical after Snaffler normalises JSON).
  // Also accept entries that omit `level` — NDJSON mid-crash may still have FileResult data.
  if (isFile || (entry.eventProperties && Object.keys(entry.eventProperties).length > 0)) {
    const fileResults = parseJsonFileEntry(entry);
    for (const result of fileResults) {
      addFileResult(acc, result);
    }
  }

  if (isShare || (entry.eventProperties && Object.keys(entry.eventProperties).length > 0)) {
    const shares = parseJsonShareEntry(entry);
    if (shares.length > 0) {
      acc.shareResults.push(...shares);
    }
  }
}

export function ingestSnafflerTextLine(acc: SnafflerParseAccumulator, line: string): void {
  if (!line) return;
  if (line.includes('[File]')) {
    const result = parseTextFileLine(line);
    if (result) addFileResult(acc, result);
  }
  if (line.includes('[Share]')) {
    const result = parseTextShareLine(line);
    if (result) acc.shareResults.push(result);
  }
}

/** Returns true when the line was a JSON object (even if it produced no findings). */
export function ingestSnafflerJsonLine(acc: SnafflerParseAccumulator, line: string): boolean {
  if (!looksLikeJsonObjectLine(line)) return false;
  const entry = tryParseJsonLine(line);
  if (!entry) return false;
  ingestSnafflerEntry(acc, entry);
  return true;
}

export function finalizeSnafflerParse(acc: SnafflerParseAccumulator): SnafflerParseOutput {
  return {
    results: acc.results,
    shares: collectShareInfo(acc.results, acc.shareResults),
    duplicateStats: undefined,
  };
}

/**
 * Walk a string without `split('\n')`, which would allocate an array of every line.
 */
export function* iterateLines(text: string): Generator<string> {
  let start = 0;
  const len = text.length;
  for (let i = 0; i < len; i++) {
    if (text.charCodeAt(i) === 10) {
      let end = i;
      if (end > start && text.charCodeAt(end - 1) === 13) end--;
      yield text.slice(start, end);
      start = i + 1;
    }
  }
  if (start < len) {
    let end = len;
    if (text.charCodeAt(end - 1) === 13) end--;
    yield text.slice(start, end);
  }
}

function extractNextJsonObject(text: string, from: number): { json: string; next: number } | null {
  const len = text.length;
  let i = from;
  while (i < len && text.charCodeAt(i) !== 123) i++; // '{'
  if (i >= len) return null;

  const objStart = i;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (; i < len; i++) {
    const c = text.charCodeAt(i);
    if (escape) {
      escape = false;
      continue;
    }
    if (c === 92 && inString) { // '\\'
      escape = true;
      continue;
    }
    if (c === 34) { // '"'
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === 123) depth++;
    else if (c === 125) {
      depth--;
      if (depth === 0) {
        return { json: text.slice(objStart, i + 1), next: i + 1 };
      }
    }
  }
  return null;
}

/**
 * Extract and parse individual objects from a large `{entries:[...]}` or `[...]`
 * document without JSON.parse() of the whole payload.
 */
export function ingestJsonDocumentByExtraction(acc: SnafflerParseAccumulator, text: string): void {
  const head = text.slice(0, 512);
  let offset = 0;
  const entriesKey = head.indexOf('"entries"');
  if (entriesKey !== -1 && entriesKey < 200) {
    const arr = text.indexOf('[', entriesKey);
    if (arr !== -1) offset = arr + 1;
  } else {
    const trimmedStart = text.match(/^\s*/)?.[0].length ?? 0;
    if (text[trimmedStart] === '[') offset = trimmedStart + 1;
  }

  let extracted = extractNextJsonObject(text, offset);
  while (extracted) {
    try {
      const parsed = JSON.parse(extracted.json);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        ingestSnafflerEntry(acc, parsed as SnafflerEntry);
      }
    } catch {
      // Skip malformed objects (truncated last line from a crashed Snaffler run)
    }
    extracted = extractNextJsonObject(text, extracted.next);
  }
}

export function ingestJsonDocument(acc: SnafflerParseAccumulator, text: string): void {
  const cleaned = stripBOM(text);
  if (cleaned.length > LARGE_JSON_PARSE_LIMIT) {
    ingestJsonDocumentByExtraction(acc, cleaned);
    return;
  }

  try {
    const parsed = JSON.parse(cleaned);
    const entries = normalizeJsonEntries(parsed);
    if (entries.length === 0 && parsed && typeof parsed === 'object') {
      // Parsed successfully but wasn't Snaffler-shaped — try extraction as a fallback.
      ingestJsonDocumentByExtraction(acc, cleaned);
      return;
    }
    for (const entry of entries) {
      ingestSnafflerEntry(acc, entry);
    }
  } catch {
    ingestJsonDocumentByExtraction(acc, cleaned);
  }
}

export function parseSnafflerJson(jsonData: SnafflerJsonData | unknown): { results: FileResult[]; duplicateStats?: DuplicateStats } {
  const acc = createSnafflerAccumulator();
  for (const entry of normalizeJsonEntries(jsonData)) {
    ingestSnafflerEntry(acc, entry);
  }
  return { results: acc.results, duplicateStats: undefined };
}

function parseJsonFileEntry(entry: SnafflerEntry): FileResult[] {
  const results: FileResult[] = [];
  try {
    const eventProps = (entry.eventProperties || {}) as EventProperties;

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
            const parsedMatchContext = limitMatchContext(parseMatchContext(rawMatchContext));
            
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

            results.push(result);
          }
        }
      }
    }
    
    // Case 2: If eventProperties is empty, try to parse the message field as a TXT format line
    if (Object.keys(eventProps).length === 0 && typeof entry.message === 'string' && entry.message.includes('[File]')) {
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
  const acc = createSnafflerAccumulator();
  for (const line of iterateLines(textData)) {
    if (line.includes('[File]')) {
      const result = parseTextFileLine(line);
      if (result) addFileResult(acc, result);
    }
  }
  return { results: acc.results, duplicateStats: undefined };
}

const VALID_RATINGS = new Set(['Red', 'Green', 'Yellow', 'Black']);
const SIZE_TOKEN = /^\d+(?:\.\d+)?(?:B|kB|MB|GB)$/i;
const DATE_TOKEN = /^\d{4}-\d{1,2}-\d{1,2}\s+\S*Z$/;

function parseTextFileLine(line: string): FileResult | null {
  try {
    let userContext = '';
    if (line.charCodeAt(0) === 91) { // '['
      const close = line.indexOf(']');
      if (close > 0) userContext = line.slice(1, close);
    }

    // {Rating} — indexOf stays linear even on multi-megabyte match-context lines
    const ratingStart = line.indexOf('{');
    if (ratingStart === -1) return null;
    const ratingEnd = line.indexOf('}', ratingStart + 1);
    if (ratingEnd === -1) return null;
    const rating = line.slice(ratingStart + 1, ratingEnd);
    if (!VALID_RATINGS.has(rating)) return null;

    // <RuleName|RWM|pattern|size|timestamp>
    const lt = line.indexOf('<', ratingEnd);
    const gt = lt === -1 ? -1 : line.indexOf('>', lt + 1);
    let ruleName = '';
    let size = '';
    let lastModified = '';
    let rwStatus: FileResult['rwStatus'] = undefined;

    if (lt !== -1 && gt !== -1) {
      const ruleDetails = line.slice(lt + 1, gt);
      const ruleParts = ruleDetails.split('|');
      ruleName = ruleParts[0] || '';

      if (ruleParts.length >= 2) {
        const permFlags = ruleParts[1].trim().toUpperCase();
        if (/^[RWM]+$/.test(permFlags)) {
          rwStatus = {
            readable: permFlags.includes('R'),
            writable: permFlags.includes('W'),
            modifyable: permFlags.includes('M'),
          };
        }
      }

      for (const part of ruleParts) {
        if (!size && SIZE_TOKEN.test(part)) size = part;
        else if (!lastModified && DATE_TOKEN.test(part)) lastModified = part;
      }

      if (!size) {
        const sizeMatch = ruleDetails.match(/(\d+(?:\.\d+)?(?:B|kB|MB|GB))/);
        if (sizeMatch) size = sizeMatch[1];
      }
    }

    // >(path) match_context
    const searchFrom = gt === -1 ? ratingEnd : gt;
    const pathMarker = line.indexOf('>(', searchFrom);
    if (pathMarker === -1) return null;
    const pathStart = pathMarker + 2;
    const pathEnd = line.indexOf(')', pathStart);
    if (pathEnd === -1) return null;
    const fullPath = line.slice(pathStart, pathEnd);

    const pathParts = fullPath.split('\\');
    const fileName = pathParts[pathParts.length - 1] || '';

    const afterPath = line.slice(pathEnd + 1).trim();
    const matchContext = afterPath ? limitMatchContext(parseMatchContext(afterPath)) : '';

    return {
      rating: rating as 'Red' | 'Green' | 'Yellow' | 'Black',
      fullPath,
      fileName,
      creationTime: lastModified,
      lastModified,
      size,
      matchContext,
      ruleName,
      matchedStrings: matchContext ? [matchContext] : [],
      triage: rating,
      userContext,
      rwStatus,
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

export function parseSnafflerOutput(
  data: SnafflerJsonData | string | string[],
  fileType: 'json' | 'text' | 'log'
): SnafflerParseOutput {
  const acc = createSnafflerAccumulator();

  if (fileType === 'json') {
    if (typeof data === 'string') {
      ingestJsonDocument(acc, data);
    } else if (Array.isArray(data) && data.length === 1 && typeof data[0] === 'string') {
      ingestJsonDocument(acc, data[0]);
    } else {
      for (const entry of normalizeJsonEntries(data)) {
        ingestSnafflerEntry(acc, entry);
      }
    }
  } else {
    const textData = Array.isArray(data) ? String(data[0] ?? '') : String(data ?? '');
    for (const line of iterateLines(textData)) {
      ingestSnafflerTextLine(acc, line);
    }
  }

  return finalizeSnafflerParse(acc);
}

export function parseSnafflerData(data: SnafflerJsonData | string | string[], fileType: 'json' | 'text' | 'log'): { results: FileResult[]; duplicateStats?: DuplicateStats } {
  const parsed = parseSnafflerOutput(data, fileType);
  return { results: parsed.results, duplicateStats: parsed.duplicateStats };
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

export function collectShareInfo(fileResults: FileResult[], shareResults: ShareResult[]): ShareInfo[] {
  const shares: ShareInfo[] = [];
  const shareMap = new Map<string, ShareMapEntry>();

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

export function parseShareData(data: SnafflerJsonData | string | string[], fileType: 'json' | 'text' | 'log'): ShareInfo[] {
  return parseSnafflerOutput(data, fileType).shares;
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
export function parseSnafflerShares(jsonData: SnafflerJsonData | unknown): ShareResult[] {
  const results: ShareResult[] = [];

  for (const entry of normalizeJsonEntries(jsonData)) {
    const message = typeof entry.message === 'string' ? entry.message : '';
    if (message.includes('[Share]')) {
      results.push(...parseJsonShareEntry(entry));
    }
  }

  return results;
}

/**
 * Parse a single [Share] entry from JSON
 */
function parseJsonShareEntry(entry: SnafflerEntry): ShareResult[] {
  const results: ShareResult[] = [];
  try {
    // Extract data from eventProperties (cast to typed interface)
    const eventProps = (entry.eventProperties || {}) as EventProperties;

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

  for (const line of iterateLines(textData)) {
    if (line.includes('[Share]')) {
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
