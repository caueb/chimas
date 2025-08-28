import * as ExcelJS from 'exceljs';
import { FileResult, Stats } from '../types';
import { GPOReport } from './GPOParser';

// -------- Helpers --------
const safeToNumber = (value: any, fallback = 0): number => {
  const n = typeof value === 'number' ? value : parseInt(String(value));
  return isNaN(n) ? fallback : n;
};

const formatDate = (dateString: string) => {
  try {
    return new Date(dateString).toLocaleString();
  } catch {
    return dateString;
  }
};

const formatFileSize = (size: string) => {
  const sizeNum = parseInt(size);
  if (isNaN(sizeNum)) return size;
  if (sizeNum < 1024) return `${sizeNum} B`;
  if (sizeNum < 1024 * 1024) return `${(sizeNum / 1024).toFixed(1)} KB`;
  if (sizeNum < 1024 * 1024 * 1024) return `${(sizeNum / (1024 * 1024)).toFixed(1)} MB`;
  return `${(sizeNum / (1024 * 1024 * 1024)).toFixed(1)} GB`;
};

// -------- File Results (Snaffler files) --------
export function exportFileResultsToCSV(
  results: FileResult[],
  visibleColumns: { rating: boolean; fullPath: boolean; creationTime: boolean; lastModified: boolean; size: boolean },
  falsePositives: Set<string>
) {
  const exportResults = results.filter(result => !falsePositives.has(`${result.fullPath}-${result.fileName}`));
  if (exportResults.length === 0) return;

  const headers: string[] = [];
  if (visibleColumns.rating) headers.push('Rating');
  if (visibleColumns.fullPath) headers.push('Full Path');
  if (visibleColumns.creationTime) headers.push('Creation Time');
  if (visibleColumns.lastModified) headers.push('Last Modified');
  if (visibleColumns.size) headers.push('Size');
  headers.push('Match Context');

  const csvContent = [
    headers.join(','),
    ...exportResults.map(result => {
      const row: string[] = [];
      if (visibleColumns.rating) row.push(`"${result.rating}"`);
      if (visibleColumns.fullPath) row.push(`"${result.fullPath.replace(/"/g, '""')}"`);
      if (visibleColumns.creationTime) row.push(`"${formatDate(result.creationTime)}"`);
      if (visibleColumns.lastModified) row.push(`"${formatDate(result.lastModified)}"`);
      if (visibleColumns.size) row.push(`"${formatFileSize(result.size)}"`);
      row.push(`"${(result.matchContext || '').replace(/"/g, '""')}"`);
      return row.join(',');
    })
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `snaffler-file-results-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function exportFileResultsToXLSX(
  allResults: FileResult[],
  results: FileResult[],
  visibleColumns: { rating: boolean; fullPath: boolean; creationTime: boolean; lastModified: boolean; size: boolean },
  falsePositives: Set<string>,
  stats: Stats,
  sourceName?: string
) {
  const exportResults = results.filter(result => !falsePositives.has(`${result.fullPath}-${result.fileName}`));
  if (exportResults.length === 0) return;

  const workbook = new ExcelJS.Workbook();
  const infoSheet = workbook.addWorksheet('Information');
  const dateStr = new Date().toLocaleString();
  const totalFiles = allResults.length;
  const filteredFiles = exportResults.length;
  const falsePositiveCount = falsePositives.size;
  const ratingColors = {
    Black: 'FF000000',
    Red: 'FFFF0000',
    Yellow: 'FFFFFF00',
    Green: 'FF00FF00',
  } as const;

  infoSheet.columns = [
    { header: 'Chimas Information', key: 'property', width: 40 },
    { header: '', key: 'value', width: 40 },
  ];
  infoSheet.addRows([
    { property: 'Export Date', value: dateStr },
    { property: 'Total Files Found', value: String(totalFiles) },
    { property: 'Files in Export', value: String(filteredFiles) },
    { property: 'False Positives Excluded', value: String(falsePositiveCount) },
    { property: 'Red Findings', value: String(stats.red) },
    { property: 'Yellow Findings', value: String(stats.yellow) },
    { property: 'Green Findings', value: String(stats.green) },
    { property: 'Black Findings', value: String(stats.black) },
    { property: 'Source File', value: sourceName || 'Unknown' },
  ]);
  infoSheet.getRow(1).font = { bold: true };
  for (const cellIdx of ['A1', 'B1']) {
    infoSheet.getCell(cellIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E0E0' } };
  }

  const resultsSheet = workbook.addWorksheet('Results');
  const headers: any[] = [];
  const colKeys: string[] = [];
  if (visibleColumns.rating) { headers.push({ header: 'Rating', key: 'rating', width: 10 }); colKeys.push('rating'); }
  if (visibleColumns.fullPath) { headers.push({ header: 'Full Path', key: 'fullPath', width: 60 }); colKeys.push('fullPath'); }
  if (visibleColumns.creationTime) { headers.push({ header: 'Creation Time', key: 'creationTime', width: 20 }); colKeys.push('creationTime'); }
  if (visibleColumns.lastModified) { headers.push({ header: 'Last Modified', key: 'lastModified', width: 20 }); colKeys.push('lastModified'); }
  if (visibleColumns.size) { headers.push({ header: 'Size', key: 'size', width: 12 }); colKeys.push('size'); }
  headers.push({ header: 'Match Context', key: 'matchContext', width: 80 });
  colKeys.push('matchContext');
  resultsSheet.columns = headers;

  exportResults.forEach(result => {
    const rowData: any = {};
    if (visibleColumns.rating) rowData.rating = result.rating;
    if (visibleColumns.fullPath) rowData.fullPath = result.fullPath;
    if (visibleColumns.creationTime) rowData.creationTime = formatDate(result.creationTime);
    if (visibleColumns.lastModified) rowData.lastModified = formatDate(result.lastModified);
    if (visibleColumns.size) rowData.size = formatFileSize(result.size);
    rowData.matchContext = result.matchContext || '';
    const row = resultsSheet.addRow(rowData);
    if (visibleColumns.rating && result.rating) {
      const ratingColumnIndex = colKeys.indexOf('rating') + 1;
      const cell = row.getCell(ratingColumnIndex);
      switch (String(result.rating).toLowerCase()) {
        case 'red':
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ratingColors.Red } } as any;
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          break;
        case 'yellow':
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ratingColors.Yellow } } as any;
          cell.font = { bold: true };
          break;
        case 'green':
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ratingColors.Green } } as any;
          cell.font = { bold: true };
          break;
        case 'black':
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ratingColors.Black } } as any;
          cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
          break;
      }
    }
  });

  headers.forEach((_, idx) => {
    const cellChar = String.fromCharCode(65 + idx);
    const cellIdx = `${cellChar}1`;
    resultsSheet.getCell(cellIdx).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    resultsSheet.getCell(cellIdx).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } } as any;
  });
  resultsSheet.autoFilter = { from: 'A1', to: `${String.fromCharCode(64 + headers.length)}${exportResults.length + 1}` } as any;
  resultsSheet.views = [{ state: 'frozen', ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `snaffler-file-results-${new Date().toISOString().split('T')[0]}.xlsx`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// -------- Share Results --------
export function exportShareResultsToCSV(shareResults: any[]) {
  if (!shareResults || shareResults.length === 0) return;
  const headers = [
    'System ID', 'Share Name', 'Path', 'Permissions', 'Comment',
    'Listable', 'Root Readable', 'Root Writable', 'Root Modifiable', 'Snaffle', 'Scan', 'File Count'
  ];
  const csvContent = [
    headers.join(','),
    ...shareResults.map(s => [
      s.systemId || '', s.shareName || '', s.path || '', s.permissions || '', (s.shareComment || '').replace(/\n/g, ' '),
      s.listable ? 'Yes' : 'No', s.rootReadable ? 'Yes' : 'No', s.rootWritable ? 'Yes' : 'No', s.rootModifyable ? 'Yes' : 'No', s.snaffle ? 'Yes' : 'No', s.scanShare ? 'Yes' : 'No',
      String(s.fileCount || 0)
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `snaffler-share-results-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function exportShareResultsToXLSX(shareResults: any[]) {
  if (!shareResults || shareResults.length === 0) return;
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Share Results');
  sheet.columns = [
    { header: 'System ID', key: 'systemId', width: 30 },
    { header: 'Share Name', key: 'shareName', width: 24 },
    { header: 'Path', key: 'path', width: 50 },
    { header: 'Permissions', key: 'permissions', width: 20 },
    { header: 'Comment', key: 'shareComment', width: 40 },
    { header: 'Listable', key: 'listable', width: 12 },
    { header: 'Root Readable', key: 'rootReadable', width: 14 },
    { header: 'Root Writable', key: 'rootWritable', width: 14 },
    { header: 'Root Modifiable', key: 'rootModifyable', width: 16 },
    { header: 'Snaffle', key: 'snaffle', width: 10 },
    { header: 'Scan', key: 'scanShare', width: 10 },
    { header: 'File Count', key: 'fileCount', width: 12 },
  ];
  shareResults.forEach(s => sheet.addRow({
    systemId: s.systemId || '', shareName: s.shareName || '', path: s.path || '', permissions: s.permissions || '', shareComment: s.shareComment || '',
    listable: s.listable ? 'Yes' : 'No', rootReadable: s.rootReadable ? 'Yes' : 'No', rootWritable: s.rootWritable ? 'Yes' : 'No', rootModifyable: s.rootModifyable ? 'Yes' : 'No',
    snaffle: s.snaffle ? 'Yes' : 'No', scanShare: s.scanShare ? 'Yes' : 'No', fileCount: safeToNumber(s.fileCount, 0)
  }));
  // Style header
  sheet.getRow(1).font = { bold: true };
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `snaffler-share-results-${new Date().toISOString().split('T')[0]}.xlsx`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// -------- GPO Results --------
type GpoFlat = {
  gpoTitle: string;
  pathInSysvol?: string;
  scope?: string;
  category?: string;
  entriesCount: number;
  findingsCount: number;
  severity: string; // Red/Yellow/Green/Black/Informational
  findingsSummary: string;
  dateCreated?: string;
  dateModified?: string;
  computerPolicy?: string;
  userPolicy?: string;
};

function severityRank(t?: string) {
  switch ((t || '').toLowerCase()) {
    case 'black': return 4;
    case 'red': return 3;
    case 'yellow': return 2;
    case 'green': return 1;
    default: return 0;
  }
}

function flattenGPO(report: GPOReport): GpoFlat[] {
  const rows: GpoFlat[] = [];
  const seen = new Set<string>();
  report.gpos.forEach(gpo => {
    const title = gpo.header.gpo || gpo.startedAtRaw || 'GPO';
    gpo.settings.forEach(s => {
      
        const maxType = (s.findings || []).reduce<string | undefined>((acc, f) => {
        return severityRank(f.type) > severityRank(acc) ? (f.type || acc) : acc;
      }, undefined);
      
      const findingsSummary = (s.findings || [])
        .map(f => `${f.type || 'Informational'}${f.reason ? ` - ${f.reason}` : ''}`)
        .join('\n');
      
        const key = [
        title,
        gpo.header.pathInSysvol || '',
        s.scope || '',
        s.category || '',
        String(Object.keys(s.entries || {}).length),
        String((s.findings || []).length),
        String(maxType || 'Informational'),
        findingsSummary
      ].join('||');

      if (seen.has(key)) return;

      seen.add(key);

      rows.push({
        gpoTitle: title,
        pathInSysvol: gpo.header.pathInSysvol,
        scope: s.scope,
        category: s.category,
        entriesCount: Object.keys(s.entries || {}).length,
        findingsCount: (s.findings || []).length,
        severity: maxType || 'Informational',
        findingsSummary,
        dateCreated: gpo.header.dateCreated,
        dateModified: gpo.header.dateModified,
        computerPolicy: gpo.header.computerPolicy,
        userPolicy: gpo.header.userPolicy,
      });
    });
  });
  return rows;
}

export function exportGPOToCSV(report: GPOReport) {
  if (!report) return;
  
  const rows = flattenGPO(report);
  
  const headers = [
    'Severity', 'GPO', 'Scope', 'Category', 'Entries', 'Findings',
    'Findings (Type - Reason)', 'SYSVOL Path',
    'GPO Created', 'GPO Modified', 'Computer Policy', 'User Policy'
  ];
  
  const csvContent = [
    headers.join(','),
    ...rows.map(r => [
      r.severity,
      r.gpoTitle,
      r.scope || '',
      r.category || '',
      String(r.entriesCount),
      String(r.findingsCount),
      r.findingsSummary,
      r.pathInSysvol || '',
      r.dateCreated || '',
      r.dateModified || '',
      r.computerPolicy || '',
      r.userPolicy || ''
    ].map(v => `"${String(v).replace(/"/g, '""').replace(/\r?\n/g, ' \u23CE ') }"`).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);

  link.setAttribute('href', url);
  link.setAttribute('download', `gpo-results-${new Date().toISOString().split('T')[0]}.csv`);
  link.style.visibility = 'hidden';
  
  document.body.appendChild(link);
  link.click();
  
  document.body.removeChild(link);
}

export async function exportGPOToXLSX(report: GPOReport) {
  if (!report) return;
  const rows = flattenGPO(report);
  const workbook = new ExcelJS.Workbook();
  const infoSheet = workbook.addWorksheet('Information');
  infoSheet.columns = [
    { header: 'GPO Information', key: 'property', width: 40 },
    { header: '', key: 'value', width: 50 },
  ];
  const dateStr = new Date().toLocaleString();
  const totalSettings = rows.length;
  const counts = rows.reduce((acc, r) => { acc[r.severity] = (acc[r.severity] || 0) + 1; return acc; }, {} as Record<string, number>);
  infoSheet.addRows([
    { property: 'Export Date', value: dateStr },
    { property: 'GPOs', value: String(report.gpos.length) },
    { property: 'Total Settings', value: String(totalSettings) },
    { property: 'Red', value: String(counts['Red'] || 0) },
    { property: 'Yellow', value: String(counts['Yellow'] || 0) },
    { property: 'Green', value: String(counts['Green'] || 0) },
    { property: 'Black', value: String(counts['Black'] || 0) },
    { property: 'Informational', value: String(counts['Informational'] || 0) },
  ]);
  infoSheet.getRow(1).font = { bold: true };

  const sheet = workbook.addWorksheet('GPO Results');
  sheet.columns = [
    { header: 'Severity', key: 'severity', width: 10 },
    { header: 'GPO', key: 'gpoTitle', width: 40 },
    { header: 'Scope', key: 'scope', width: 22 },
    { header: 'Category', key: 'category', width: 28 },
    { header: 'Entries', key: 'entriesCount', width: 10 },
    { header: 'Findings', key: 'findingsCount', width: 10 },
    { header: 'Findings (Type - Reason)', key: 'findingsSummary', width: 60 },
    { header: 'SYSVOL Path', key: 'pathInSysvol', width: 50 },
    { header: 'GPO Created', key: 'dateCreated', width: 22 },
    { header: 'GPO Modified', key: 'dateModified', width: 22 },
    { header: 'Computer Policy', key: 'computerPolicy', width: 24 },
    { header: 'User Policy', key: 'userPolicy', width: 24 },
  ];
  rows.forEach(r => sheet.addRow(r));
  sheet.getRow(1).font = { bold: true };

  // Apply coloring to Severity column
  const severityColors = {
    Black: 'FF000000',
    Red: 'FFFF0000',
    Yellow: 'FFFFFF00',
    Green: 'FF00FF00',
    Informational: 'FFE0E0E0',
  } as const;
  const severityHeaderIndex = 1; // first column
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // skip header
    const cell = row.getCell(severityHeaderIndex);
    const severityRaw = String(cell.value ?? '').toLowerCase();
    let key: keyof typeof severityColors | undefined;
    switch (severityRaw) {
      case 'red': key = 'Red'; break;
      case 'yellow': key = 'Yellow'; break;
      case 'green': key = 'Green'; break;
      case 'black': key = 'Black'; break;
      case 'informational': key = 'Informational'; break;
    }
    if (key) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: severityColors[key] } } as any;
      // Use white text for better contrast on dark colors
      if (key === 'Red' || key === 'Black') {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      } else {
        cell.font = { bold: true };
      }
    }
  });

  // Add a detailed per-finding sheet (deduplicated)
  const findingsSheet = workbook.addWorksheet('GPO Findings');
  findingsSheet.columns = [
    { header: 'Severity', key: 'severity', width: 10 },
    { header: 'GPO', key: 'gpoTitle', width: 40 },
    { header: 'Scope', key: 'scope', width: 22 },
    { header: 'Category', key: 'category', width: 28 },
    { header: 'Reason', key: 'reason', width: 80 },
    { header: 'SYSVOL Path', key: 'pathInSysvol', width: 50 },
    { header: 'GPO Created', key: 'dateCreated', width: 22 },
    { header: 'GPO Modified', key: 'dateModified', width: 22 },
  ];
  const seenFindings = new Set<string>();
  report.gpos.forEach(gpo => {
    const title = gpo.header.gpo || gpo.startedAtRaw || 'GPO';
    gpo.settings.forEach(s => {
      (s.findings || []).forEach(f => {
        const severity = f.type || 'Informational';
        const reason = f.reason || '';
        const key = [
          title, gpo.header.pathInSysvol || '', s.scope || '', s.category || '', severity, reason,
          gpo.header.dateCreated || '', gpo.header.dateModified || ''
        ].join('||');
        if (seenFindings.has(key)) return;
        seenFindings.add(key);
        findingsSheet.addRow({
          severity,
          gpoTitle: title,
          scope: s.scope,
          category: s.category,
          reason,
          pathInSysvol: gpo.header.pathInSysvol,
          dateCreated: gpo.header.dateCreated,
          dateModified: gpo.header.dateModified,
        });
      });
      if (!s.findings || s.findings.length === 0) {
        const key = [
          title, gpo.header.pathInSysvol || '', s.scope || '', s.category || '', 'Informational', '',
          gpo.header.dateCreated || '', gpo.header.dateModified || ''
        ].join('||');
        if (!seenFindings.has(key)) {
          seenFindings.add(key);
          findingsSheet.addRow({
            severity: 'Informational',
            gpoTitle: title,
            scope: s.scope,
            category: s.category,
            reason: '',
            pathInSysvol: gpo.header.pathInSysvol,
            dateCreated: gpo.header.dateCreated,
            dateModified: gpo.header.dateModified,
          });
        }
      }
    });
  });
  findingsSheet.getRow(1).font = { bold: true };

  // Apply coloring to Severity column in Findings sheet as well
  const findingsSeverityHeaderIndex = 1; // first column
  findingsSheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const cell = row.getCell(findingsSeverityHeaderIndex);
    const severityRaw = String(cell.value ?? '').toLowerCase();
    let key: keyof typeof severityColors | undefined;
    switch (severityRaw) {
      case 'red': key = 'Red'; break;
      case 'yellow': key = 'Yellow'; break;
      case 'green': key = 'Green'; break;
      case 'black': key = 'Black'; break;
      case 'informational': key = 'Informational'; break;
    }
    if (key) {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: severityColors[key] } } as any;
      if (key === 'Red' || key === 'Black') {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      } else {
        cell.font = { bold: true };
      }
    }
  });

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', `gpo-results-${new Date().toISOString().split('T')[0]}.xlsx`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
