import { format } from 'date-fns';
import { safeDateTimestamp } from './parser';

/**
 * Format byte size to human-readable string
 * Accepts both string and number inputs for flexibility
 *
 * Consolidates implementations from:
 * - App.tsx:518-524
 * - Dashboard.tsx:24-32
 * - DetailPanel.tsx:17-25
 * - ResultsTable.tsx:110-118
 */
export function formatFileSize(bytes: number | string): string {
  const sizeNum = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;

  if (isNaN(sizeNum) || sizeNum === 0) return '0 B';

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(sizeNum) / Math.log(k));
  const clampedI = Math.min(i, sizes.length - 1);

  return `${parseFloat((sizeNum / Math.pow(k, clampedI)).toFixed(1))} ${sizes[clampedI]}`;
}

/**
 * Format date string using date-fns
 * Returns the original string if parsing fails
 *
 * Consolidates implementations from:
 * - DetailPanel.tsx:27-33
 * - ResultsTable.tsx:97-103
 * - GPODetails.tsx
 */
export function formatDate(dateString: string, formatStr = 'dd/MM/yyyy HH:mm:ss'): string {
  if (!dateString) return '-';

  try {
    const timestamp = safeDateTimestamp(dateString);
    if (timestamp === 0) return dateString; // Return original if invalid
    return format(new Date(dateString), formatStr);
  } catch {
    return dateString;
  }
}

/**
 * Format date to localized string without date-fns dependency
 * Used in contexts where date-fns isn't needed
 */
export function formatDateLocale(dateString: string): string {
  if (!dateString) return '-';

  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return dateString;
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  } catch {
    return dateString;
  }
}
