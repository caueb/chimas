export interface InfoLine {
    raw: string;
    timestamp?: string;
    level?: string; // e.g., Info
    message?: string;
  }
  
  export interface GpoHeader {
    gpo?: string; // full title line
    dateCreated?: string;
    dateModified?: string;
    pathInSysvol?: string;
    computerPolicy?: string;
    userPolicy?: string;
    [k: string]: string | undefined;
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
  
    // Find indices of [GPO] markers
    const gpoIdx: number[] = [];
    lines.forEach((l, i) => {
      if (/\[GPO\]/.test(l)) gpoIdx.push(i);
    });
  
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
        out[key] = val;
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
  
      // Look for immediate nested Finding sub-block(s)
      const findings: Finding[] = [];
      while (i < lines.length && isBlockFence(lines[i])) {
        // peek ahead: if next table header starts with "Finding", parse it; otherwise leave for outer loop
        const j = i + 1;
        const localTable: string[] = [];
        let k = j;
        while (k < lines.length && isTableRow(lines[k])) {
          localTable.push(lines[k]);
          k++;
        }
        const localRows = parseTableRows(localTable);
        if (localRows.length && /Finding/i.test(localRows[0][0])) {
          // Capture severity from the header row, e.g. ["Finding", "Green"]
          const headerRow = localRows[0];
          const headerType = headerRow.length > 1 ? headerRow[1]?.trim() : undefined;
          // parse finding rows (after header)
          localRows.shift(); // drop header row
          const kv = coalesceKVRows(localRows);
          const f: Finding = { ...kv };
          f.type = headerType || kv["Finding"] || kv["Type"];
          // Derive reason
          f.reason = kv["Reason"] || f.reason;
          findings.push(f);
          // advance
          rawLines.push(lines[i]);
          for (let p = j; p < k; p++) rawLines.push(lines[p]);
          i = k; // next after the finding's table
        } else {
          break; // not a Finding; let outer loop handle
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
      // Convert rows into header fields
      for (const r of headerRows) {
        if (r.length < 2) continue;
        const key = r[0].toLowerCase();
        const val = r[1];
        if (key.startsWith("gpo")) header.gpo = val;
        else if (key.startsWith("date created")) header.dateCreated = val;
        else if (key.startsWith("date modified")) header.dateModified = val;
        else if (key.startsWith("path in sysvol")) header.pathInSysvol = val;
        else if (key.startsWith("computer policy")) header.computerPolicy = val;
        else if (key.startsWith("user policy")) header.userPolicy = val;
        else header[r[0]] = val;
      }
  
      // After the header, parse zero or more setting blocks delimited by "\\___" fences.
      const settings: SettingBlock[] = [];
      while (i < end) {
        const l = lines[i];
        if (isBlockFence(l)) {
          const [block, nextI] = parseSettingBlock(i);
          settings.push(block);
          i = nextI;
        } else {
          i++;
        }
      }
  
      gpos.push({ startedAtRaw: gpoStartRaw, header, settings });
    }
  
    return { info, gpos, finishedAt, duration, raw };
  }
  
  
  