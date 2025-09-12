export interface InfoLine {
    raw: string;
    timestamp?: string;
    level?: string; // e.g., Info
    message?: string;
  }
  
  export interface GpoHeader {
    gpo?: string; // clean GPO name without GUID and status
    gpoId?: string; // GPO GUID
    gpoStatus?: string; // Current or Morphed
    dateCreated?: string;
    dateModified?: string;
    pathInSysvol?: string;
    computerPolicy?: string;
    userPolicy?: string;
    links?: string[]; // array of all Link entries
    [k: string]: string | string[] | undefined;
  }
  
  export interface Finding {
    type?: string; // e.g., "Yellow"
    reason?: string; // possibly multi-line combined
    [k: string]: string | undefined;
  }
  
  export interface SettingBlock {
    scope?: "Computer Policy" | "User Policy" | string;
    category?: string; // e.g., Registry, Script, User Rights Assignment, Kerberos Policy
    entries: Record<string, string>;
    findings: Finding[];
    rawLines: string[]; // for diagnostics
  }
  
  export interface Gpo {
    startedAtRaw?: string; // the [GPO] line
    header: GpoHeader;
    settings: SettingBlock[];
    findings: Finding[];
  }
  
  export interface GPOReport {
    info: InfoLine[];
    gpos: Gpo[];
    finishedAt?: string;
    duration?: string;
    raw: string;
  }
  
  // -------------- Core parser --------------
  export function parseGPO(raw: string): GPOReport {
    const lines = raw.split(/\r?\n/);
    const info: InfoLine[] = [];
    const gpos: Gpo[] = [];
    let finishedAt: string | undefined;
    let duration: string | undefined;
  
    // Find indices of valid GPO sections (look for the actual table structure)
    const gpoIdx: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Look for [GPO] marker followed by a table structure
      if (/\[GPO\]/.test(line)) {
        // Check if the next line is the GPO table header (immediate)
        if (i + 1 < lines.length && /^\s*\|.*GPO.*\|/.test(lines[i + 1])) {
          gpoIdx.push(i);
        }
      }
    }
  
    // Pre-pass: collect [Info] and [Finish]
    for (const l of lines) {
      if (/\[(Info|Finish)\]/.test(l)) {
        const m = l.match(/^(.*?)\s*\[(Info|Finish)\]\s*(.*)$/);
        if (m) {
          const [, ts, level, rest] = m;
          const msg = rest?.trim() || undefined;
          info.push({ raw: l, timestamp: ts?.trim(), level, message: msg });
          if (level === "Finish") {
            // Try to extract finished time and duration if present in nearby lines
            const tail = raw.slice(raw.indexOf(l)).split(/\r?\n/).slice(0, 5).join("\n");
            const finM = tail.match(/Finished at\s+(.+)/i);
            const durM = tail.match(/GPOin' took\s+([\d:.]+)/i);
            if (finM) finishedAt = finM[1].trim();
            if (durM) duration = durM[1].trim();
          }
        } else {
          info.push({ raw: l });
        }
      }
    }
  
    // Helper: determine if a line is a table row (starts with a pipe, allowing leading spaces)
    const isTableRow = (s: string) => /^\s*\|.*\|\s*$/.test(s);
    const isSeparator = (s: string) => /^\s*\|\s*-{2,}\s*\|/.test(s);
    const isBlockFence = (s: string) => /^\s*\\___/.test(s);
  
    // Parse table to array of rows (each row: string[] of cells)
    function parseTableRows(tableLines: string[]): string[][] {
      const rows: string[][] = [];
      for (const line of tableLines) {
        if (!isTableRow(line)) continue;
        if (isSeparator(line)) continue;
        // Split by '|' and trim each cell
        const cells = line
          .trim()
          .replace(/^\|/, "")
          .replace(/\|\s*$/, "")
          .split(/\|/)
          .map((c) => c.trim());
        rows.push(cells);
      }
      return rows;
    }
  
    // Join continuation rows where the first column is empty (e.g., "", "-")
    function coalesceKVRows(rows: string[][]): Record<string, string> {
      const out: Record<string, string> = {};
      let lastKey: string | undefined;
      for (const r of rows) {
        if (r.length === 1) {
          // Unusual: single cell row; treat as continuation of value
          if (lastKey) out[lastKey] = joinValue(out[lastKey], r[0]);
          continue;
        }
        const [kRaw, vRaw] = r;
        const key = (kRaw || "").trim();
        const val = (vRaw || "").trim();
        if (!key) {
          // Continuation line — append to previous value
          if (lastKey) out[lastKey] = joinValue(out[lastKey], val);
          continue;
        }
        lastKey = key;
        if (out[key]) {
          // Multiple entries with same key - append with newline
          if (key === 'Member') {
            // For Member entries, always use newline to separate different members
            out[key] = out[key] + '\n' + val;
          } else {
            out[key] = joinValue(out[key], val);
          }
        } else {
          out[key] = val;
        }
      }
      return out;
    }
  
    function joinValue(prev: string | undefined, add: string): string {
      if (!prev) return add;
      // If the continuation looks like a broken word wrap, join with a space; otherwise newline.
      if (/^[\w\-()\\/\\.]/.test(add)) return prev + " " + add;
      return prev + "\n" + add;
    }
  
    // Parse a single setting block starting at index i. Returns [block, nextIndex]
    function parseSettingBlock(startIdx: number): [SettingBlock, number] {
      const rawLines: string[] = [];
      let i = startIdx;
      // consume the fence line ("\\___") if present
      if (isBlockFence(lines[i])) {
        rawLines.push(lines[i]);
        i++;
      }
      // collect table lines until next fence, next [GPO], or a blank line followed by non-table
      const table: string[] = [];
      while (i < lines.length) {
        const l = lines[i];
        if (/\[GPO\]/.test(l)) break;
        if (isBlockFence(l)) break; // next block starts here
        if (!l.trim() && table.length > 0) break; // end of this block
        if (isTableRow(l)) table.push(l);
        rawLines.push(l);
        i++;
      }
  
      const rows = parseTableRows(table);
      // Expect at least a header row like [ "Setting - Computer Policy", "Registry" ]
      let scope: string | undefined;
      let category: string | undefined;
      if (rows.length > 0) {
        const hdr = rows[0];
        if (hdr.length >= 2 && /Setting/i.test(hdr[0])) {
          const m = hdr[0].match(/Setting\s*-\s*(.+)/i);
          scope = m?.[1]?.trim();
          category = hdr[1]?.trim();
          rows.shift(); // remove header
        }
      }
  
        // Remaining rows are key/value pairs — but there may be nested Finding blocks that appear as their own table after another fence
        const entries = coalesceKVRows(rows);
  
      // Look for immediate nested sub-blocks (Findings and other nested tables)
      const findings: Finding[] = [];
      while (i < lines.length && isBlockFence(lines[i])) {
        const j = i + 1;
        if (j < lines.length && lines[j].startsWith('        |')) {
          // Found a nested block - collect all indented lines until next fence or end
          const localTable: string[] = [];
          let k = j;
          while (k < lines.length && lines[k].startsWith('        ')) {
            localTable.push(lines[k]);
            k++;
          }
          const localRows = parseTableRows(localTable);
          if (localRows.length) {
            const headerRow = localRows[0];
            const headerType = headerRow.length > 1 ? headerRow[1]?.trim() : undefined;
            
            if (/Finding/i.test(headerRow[0])) {
              // This is a Finding block
              localRows.shift(); // drop header row
              const kv = coalesceKVRows(localRows);
              const f: Finding = { ...kv };
              f.type = headerType || kv["Finding"] || kv["Type"];
              f.reason = kv["Reason"] || f.reason;
              f.detail = kv["Detail"] || f.detail;
              findings.push(f);
            } else {
              // This is a regular nested table - merge into main entries
              const kv = coalesceKVRows(localRows);
              Object.assign(entries, kv);
            }
            
            // advance
            rawLines.push(lines[i]);
            for (let p = j; p < k; p++) rawLines.push(lines[p]);
            i = k; // next after the nested table
          } else {
            break; // not a valid table; let outer loop handle
          }
        } else {
          break; // not a nested block; let outer loop handle
        }
      }
  
      return [
        {
          scope,
          category,
          entries,
          findings,
          rawLines,
        },
        i,
      ];
    }
  
    // Parse each GPO section
    for (let gi = 0; gi < gpoIdx.length; gi++) {
      const start = gpoIdx[gi];
      const end = gi + 1 < gpoIdx.length ? gpoIdx[gi + 1] : lines.length;
      const section = lines.slice(start, end);
      const gpoStartRaw = section[0];
      
  
      // The first table after the [GPO] line is the header table
      let i = start + 1;
      const headerTable: string[] = [];
      while (i < end && isTableRow(lines[i])) {
        headerTable.push(lines[i]);
        i++;
      }
      const headerRows = parseTableRows(headerTable);
      const header: GpoHeader = {};
      const links: string[] = [];
      
      // Convert rows into header fields
      for (const r of headerRows) {
        if (r.length < 2) continue;
        const key = r[0].toLowerCase();
        const val = r[1];
        if (key.startsWith("gpo")) {
          // Parse GPO name, ID, and status
          const trimmedVal = val.trim();
          const gpoMatch = trimmedVal.match(/^(.+?)\s+(\{[A-F0-9-]+\})\s+(Current|Morphed)$/);
          if (gpoMatch) {
            header.gpo = gpoMatch[1].trim(); // Clean name
            header.gpoId = gpoMatch[2]; // GUID
            header.gpoStatus = gpoMatch[3]; // Current or Morphed
          } else {
            // Fallback if pattern doesn't match
            header.gpo = trimmedVal;
          }
        }
        else if (key.startsWith("date created")) header.dateCreated = val.trim();
        else if (key.startsWith("date modified")) header.dateModified = val.trim();
        else if (key.startsWith("path in sysvol")) header.pathInSysvol = val.trim();
        else if (key.startsWith("computer policy")) header.computerPolicy = val.trim();
        else if (key.startsWith("user policy")) header.userPolicy = val.trim();
        else if (key.startsWith("link")) {
          links.push(val.trim());
        }
        else header[r[0]] = val.trim();
      }
      
      // Store all links in the header
      if (links.length > 0) {
        header.links = links;
      }
      
  
    // After the header, parse zero or more setting blocks delimited by "\\___" fences.
    const settings: SettingBlock[] = [];
    while (i < end) {
      const l = lines[i];
      
      // Check if this line starts a setting block (either with fence or with "Setting -" pattern)
      if (isBlockFence(l) || (isTableRow(l) && /Setting\s*-\s*/i.test(l))) {
        const [block, nextI] = parseSettingBlock(i);
        
        // Add the original block (no splitting)
        settings.push(block);
        
        i = nextI;
        
      } else {
        i++;
      }
    }
  
    // Collect all findings from all settings
    const findings: Finding[] = [];
    settings.forEach(setting => {
      findings.push(...setting.findings);
    });
  
      gpos.push({ startedAtRaw: gpoStartRaw, header, settings, findings });
    }
  
    return { info, gpos, finishedAt, duration, raw };
  }
  
  
  