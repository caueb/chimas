import { detectBloodHoundFileType } from './bloodhoundParser';
import { parseGPO, type GPOReport } from './GPOParser';
import {
  createSnafflerAccumulator,
  ingestJsonDocument,
  ingestSnafflerEntry,
  ingestSnafflerJsonLine,
  ingestSnafflerTextLine,
  finalizeSnafflerParse,
  iterateLines,
  stripBOM,
  yieldToUi,
} from './parser';
import { streamJsonObjects } from './jsonStream';
import type { SnafflerEntry, SnafflerParseOutput } from '../types';

const HEAD_BYTES = 64 * 1024;
const YIELD_EVERY_ITEMS = 1500;
/** Below this, a single file.text() + JSON.parse is fine. Above it, stream. */
const IN_MEMORY_PARSE_LIMIT = 4 * 1024 * 1024;

export type UploadedFileType = 'json' | 'text' | 'log';

export type ProcessedUpload =
  | { kind: 'snaffler'; output: SnafflerParseOutput }
  | { kind: 'gpo'; report: GPOReport }
  | { kind: 'bloodhound' };

export interface ProcessFileOptions {
  gpoAlreadyLoaded?: boolean;
  onProgress?: (status: string) => void;
}

function extensionFileType(fileName: string): UploadedFileType {
  const lower = fileName.toLowerCase();
  if (lower.endsWith('.json')) return 'json';
  if (lower.endsWith('.log')) return 'log';
  return 'text';
}

function looksLikeGpo(text: string): boolean {
  return /\[GPO\]/.test(text) && (/^\s*\|.*\|/m.test(text) || /\\___/.test(text));
}

function looksLikeBloodHoundHead(head: string): boolean {
  return /"meta"\s*:/.test(head) && /"data"\s*:/.test(head);
}

function looksLikeJsonHead(head: string): boolean {
  const trimmed = head.trimStart();
  return trimmed.startsWith('{') || trimmed.startsWith('[');
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

async function* iterateFileLines(file: File): AsyncGenerator<string> {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;
      let nl: number;
      while ((nl = buffer.indexOf('\n')) !== -1) {
        let line = buffer.slice(0, nl);
        if (line.endsWith('\r')) line = line.slice(0, -1);
        yield line;
        buffer = buffer.slice(nl + 1);
      }
    }
    if (buffer) {
      if (buffer.endsWith('\r')) buffer = buffer.slice(0, -1);
      yield buffer;
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}

/**
 * Read, detect, and parse an uploaded Snaffler / Group3r / BloodHound file.
 *
 * Large Snaffler JSON is almost always one object per line (NLog NDJSON, or
 * Snaffler's FixJSONOutput wrapper). We stream those lines instead of
 * JSON.parse()'ing the entire document, which is what froze the tab.
 */
export async function processUploadedFile(
  file: File,
  options: ProcessFileOptions = {}
): Promise<ProcessedUpload> {
  const { gpoAlreadyLoaded = false, onProgress } = options;
  const fileType = extensionFileType(file.name);
  onProgress?.('Reading file…');

  const head = stripBOM(await file.slice(0, HEAD_BYTES).text());

  if (fileType === 'json' && gpoAlreadyLoaded && looksLikeBloodHoundHead(head)) {
    onProgress?.('Checking BloodHound data…');
    const text = await file.text();
    try {
      const jsonData = JSON.parse(text);
      if (detectBloodHoundFileType(jsonData)) {
        return { kind: 'bloodhound' };
      }
    } catch {
      // Not BloodHound — fall through to Snaffler parsing
    }
  }

  if (fileType !== 'json' && looksLikeGpo(head)) {
    onProgress?.('Parsing Group3r output…');
    const text = await file.text();
    return { kind: 'gpo', report: parseGPO(text) };
  }

  const treatAsJson = fileType === 'json' || looksLikeJsonHead(head);
  onProgress?.('Parsing Snaffler output…');

  if (treatAsJson) {
    return {
      kind: 'snaffler',
      output: await parseSnafflerJsonFile(file, onProgress),
    };
  }

  const acc = createSnafflerAccumulator();
  let lineNo = 0;
  let sawGpo = false;

  for await (const rawLine of iterateFileLines(file)) {
    const line = lineNo === 0 ? stripBOM(rawLine) : rawLine;
    lineNo++;

    if (!sawGpo && line.includes('[GPO]')) sawGpo = true;

    if (!ingestSnafflerJsonLine(acc, line)) {
      ingestSnafflerTextLine(acc, line);
    }

    if (lineNo % YIELD_EVERY_ITEMS === 0) {
      onProgress?.(
        `Parsing Snaffler output… ${formatCount(lineNo)} lines, ${formatCount(acc.results.length)} files`
      );
      await yieldToUi();
    }
  }

  if (sawGpo && acc.results.length === 0 && acc.shareResults.length === 0) {
    onProgress?.('Parsing Group3r output…');
    const text = await file.text();
    if (looksLikeGpo(text)) {
      return { kind: 'gpo', report: parseGPO(text) };
    }
  }

  return { kind: 'snaffler', output: finalizeSnafflerParse(acc) };
}

/**
 * Parse one Snaffler JSON file. Small files use a single in-memory parse
 * (needed for pretty-printed samples). Large files are streamed as individual
 * objects so the tab never JSON.parse()'s a multi-hundred-MB document.
 */
async function parseSnafflerJsonFile(
  file: File,
  onProgress?: (status: string) => void
): Promise<SnafflerParseOutput> {
  if (file.size <= IN_MEMORY_PARSE_LIMIT) {
    const text = await file.text();
    const acc = createSnafflerAccumulator();
    ingestJsonDocument(acc, text);
    if (acc.jsonObjectsParsed === 0) {
      for (const line of iterateLines(text)) {
        ingestSnafflerJsonLine(acc, line);
      }
    }
    return finalizeSnafflerParse(acc);
  }

  const acc = createSnafflerAccumulator();
  let seen = 0;
  for await (const obj of streamJsonObjects(file)) {
    if (obj && typeof obj === 'object' && !Array.isArray(obj)) {
      ingestSnafflerEntry(acc, obj as SnafflerEntry);
    }
    seen++;
    if (seen % YIELD_EVERY_ITEMS === 0) {
      onProgress?.(
        `Parsing Snaffler output… ${formatCount(seen)} events, ${formatCount(acc.results.length)} files`
      );
      await yieldToUi();
    }
  }

  return finalizeSnafflerParse(acc);
}

export async function applyInChunks<T, R>(
  items: T[],
  fn: (item: T) => R,
  chunkSize = 2000,
  onChunk?: (done: number, total: number) => void
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  for (let i = 0; i < items.length; i++) {
    out[i] = fn(items[i]);
    if (i > 0 && i % chunkSize === 0) {
      onChunk?.(i, items.length);
      await yieldToUi();
    }
  }
  return out;
}
