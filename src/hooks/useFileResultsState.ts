import { useState, useCallback } from 'react';
import { FileResult, Stats, ErrorInfo, DuplicateStats } from '../types';

interface UseFileResultsState {
  // Data
  allResults: FileResult[];
  selectedResult: FileResult | null;
  stats: Stats;
  loadedFileName: string;
  loadedFileSize: string;
  duplicateStats: DuplicateStats | null;
  errorInfo: ErrorInfo | null;
  falsePositives: Set<string>;
  showExportDropdown: boolean;
  fileResultsScrollTop: number;

  // Setters
  setAllResults: (results: FileResult[]) => void;
  setSelectedResult: (result: FileResult | null) => void;
  setStats: (stats: Stats) => void;
  setLoadedFileName: (name: string) => void;
  setLoadedFileSize: (size: string) => void;
  setDuplicateStats: (stats: DuplicateStats | null) => void;
  setErrorInfo: (info: ErrorInfo | null) => void;
  setFalsePositives: (fp: Set<string>) => void;
  toggleFalsePositive: (path: string) => void;
  setShowExportDropdown: (show: boolean) => void;
  setFileResultsScrollTop: (top: number) => void;

  // Actions
  clearResults: () => void;
}

const initialStats: Stats = {
  total: 0,
  red: 0,
  yellow: 0,
  green: 0,
  black: 0,
};

/**
 * Custom hook for File Results state management
 *
 * Consolidates File Results state from App.tsx:
 * - allResults, selectedResult
 * - stats (total, red, yellow, green, black)
 * - loadedFileName, loadedFileSize
 * - duplicateStats, errorInfo
 * - falsePositives
 * - showExportDropdown
 * - fileResultsScrollTop
 */
export function useFileResultsState(): UseFileResultsState {
  // Core data state
  const [allResults, setAllResults] = useState<FileResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<FileResult | null>(null);
  const [stats, setStats] = useState<Stats>(initialStats);

  // File metadata state
  const [loadedFileName, setLoadedFileName] = useState<string>('');
  const [loadedFileSize, setLoadedFileSize] = useState<string>('');

  // Processing state
  const [duplicateStats, setDuplicateStats] = useState<DuplicateStats | null>(null);
  const [errorInfo, setErrorInfo] = useState<ErrorInfo | null>(null);

  // User interaction state
  const [falsePositives, setFalsePositives] = useState<Set<string>>(new Set());
  const [showExportDropdown, setShowExportDropdown] = useState(false);
  const [fileResultsScrollTop, setFileResultsScrollTop] = useState<number>(0);

  // Toggle false positive for a result
  const toggleFalsePositive = useCallback((path: string) => {
    setFalsePositives((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(path)) {
        newSet.delete(path);
      } else {
        newSet.add(path);
      }
      return newSet;
    });
  }, []);

  // Clear all results and reset state
  const clearResults = useCallback(() => {
    setAllResults([]);
    setSelectedResult(null);
    setStats(initialStats);
    setLoadedFileName('');
    setLoadedFileSize('');
    setDuplicateStats(null);
    setErrorInfo(null);
    setFalsePositives(new Set());
    setShowExportDropdown(false);
    setFileResultsScrollTop(0);
  }, []);

  return {
    // Data
    allResults,
    selectedResult,
    stats,
    loadedFileName,
    loadedFileSize,
    duplicateStats,
    errorInfo,
    falsePositives,
    showExportDropdown,
    fileResultsScrollTop,

    // Setters
    setAllResults,
    setSelectedResult,
    setStats,
    setLoadedFileName,
    setLoadedFileSize,
    setDuplicateStats,
    setErrorInfo,
    setFalsePositives,
    toggleFalsePositive,
    setShowExportDropdown,
    setFileResultsScrollTop,

    // Actions
    clearResults,
  };
}
