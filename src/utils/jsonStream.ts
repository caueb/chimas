/** Max characters for a single JSON object. Oversized events are skipped. */
export const MAX_JSON_OBJECT_CHARS = 2 * 1024 * 1024;

export type JsonStreamShape = 'unknown' | 'ndjson' | 'entries-array' | 'array';

/**
 * Find the next top-level `{ ... }` object in `text` starting at `from`.
 * Returns null if the object is incomplete (need more bytes).
 * `json` is null when the object existed but exceeded MAX_JSON_OBJECT_CHARS.
 */
export function extractNextJsonObject(
  text: string,
  from: number,
  maxChars: number = MAX_JSON_OBJECT_CHARS
): { json: string | null; next: number } | null {
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
    if (c === 92 && inString) {
      // '\\'
      escape = true;
      continue;
    }
    if (c === 34) {
      // '"'
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === 123) depth++;
    else if (c === 125) {
      depth--;
      if (depth === 0) {
        const size = i + 1 - objStart;
        if (size > maxChars) {
          return { json: null, next: i + 1 };
        }
        return { json: text.slice(objStart, i + 1), next: i + 1 };
      }
    }
  }

  return null;
}

function detectShape(buffer: string): { shape: JsonStreamShape; scan: number } | null {
  const firstNonWs = buffer.search(/\S/);
  if (firstNonWs === -1) return null;

  const head = buffer.slice(firstNonWs, firstNonWs + 512);
  if (/^\{\s*"entries"\s*:/.test(head)) {
    const entriesIdx = buffer.indexOf('"entries"', firstNonWs);
    const bracket = entriesIdx === -1 ? -1 : buffer.indexOf('[', entriesIdx);
    if (bracket === -1) return null; // need more bytes to find the array
    return { shape: 'entries-array', scan: bracket + 1 };
  }
  if (buffer.charCodeAt(firstNonWs) === 91) {
    // '['
    return { shape: 'array', scan: firstNonWs + 1 };
  }
  if (buffer.charCodeAt(firstNonWs) === 123) {
    // '{'
    return { shape: 'ndjson', scan: firstNonWs };
  }
  return { shape: 'ndjson', scan: firstNonWs };
}

/**
 * Stream top-level JSON objects out of a File without ever building one
 * giant string or JSON.parse()'ing the whole document.
 *
 * Understands Snaffler's three JSON shapes:
 * - NDJSON (one object per line, including interrupted runs)
 * - `{ "entries": [ {...}, {...} ] }` (FixJSONOutput / jq wrap)
 * - a raw `[ {...}, {...} ]` array
 */
export async function* streamJsonObjects(
  file: File,
  maxChars: number = MAX_JSON_OBJECT_CHARS
): AsyncGenerator<unknown> {
  const reader = file.stream().pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  let scan = 0;
  let shape: JsonStreamShape = 'unknown';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += value;

      if (shape === 'unknown') {
        const detected = detectShape(buffer);
        if (!detected) continue;
        shape = detected.shape;
        scan = detected.scan;
      }

      while (true) {
        const extracted = extractNextJsonObject(buffer, scan, maxChars);
        if (!extracted) {
          if (scan > 0) {
            buffer = buffer.slice(scan);
            scan = 0;
          }
          break;
        }
        scan = extracted.next;
        if (extracted.json) {
          try {
            yield JSON.parse(extracted.json);
          } catch {
            // truncated / malformed object — skip
          }
        }
      }
    }

    if (shape === 'unknown') {
      const detected = detectShape(buffer);
      if (detected) {
        shape = detected.shape;
        scan = detected.scan;
      }
    }

    if (shape !== 'unknown') {
      let extracted = extractNextJsonObject(buffer, scan, maxChars);
      while (extracted) {
        if (extracted.json) {
          try {
            yield JSON.parse(extracted.json);
          } catch {
            // skip
          }
        }
        extracted = extractNextJsonObject(buffer, extracted.next, maxChars);
      }
    }
  } finally {
    try {
      reader.releaseLock();
    } catch {
      // already released
    }
  }
}
