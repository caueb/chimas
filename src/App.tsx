import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FileResult, SortField, SortDirection, CustomFilter } from './types';
import { FileUpload } from './components/FileUpload';
import { ResultsTable } from './components/ResultsTable';
import { DetailPanel } from './components/DetailPanel';
import { Filters } from './components/Filters';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { GPODashboard } from './components/GPODashboard';
import { ShareResults } from './components/ShareResults';
import { ErrorDisplay } from './components/ErrorDisplay';
import { parseSnafflerData, parseShareData } from './utils/parser';
import { format } from 'date-fns';
import * as ExcelJS from 'exceljs';
import { parseGPO, GPOReport } from './utils/GPOParser';
import GPOResults from './components/GPOResults.tsx';
import GPODetails from './components/GPODetails.tsx';
import {
  exportFileResultsToCSV,
  exportFileResultsToXLSX,
  exportShareResultsToCSV,
  exportShareResultsToXLSX,
  exportGPOToCSV,
  exportGPOToXLSX,
} from './utils/exporter';

type View = 'dashboard' | 'file-results' | 'share-results' | 'GPO-results' | 'GPO-details';

// Credentials keywords for filtering - moved outside component to prevent recreation
const CREDENTIALS_KEYWORDS = [
  'password', 'pass', 'p@ss', 'pwd', 'p@$$w0rd', 'passwd', 'passcode', 'passphrase',
  'credentials', 'creds', '$cred', 'cred', 'login', 'authtoken', 'accesskey', 'apikey',
  'secret', 'secrettoken', 'securestring', '-asstring', 'vaultpass', 'rootpass',
  'adminpass', 'dbpass', 'dbuser', 'dbadmin', 'dbcred', 'authpass', 'masterkey', 'clientsecret'
];

function App() {
  const [allResults, setAllResults] = useState<FileResult[]>([]);
  const [filteredResults, setFilteredResults] = useState<FileResult[]>([]);
  const [selectedResult, setSelectedResult] = useState<FileResult | null>(null);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [isLeftPanelMinimized, setIsLeftPanelMinimized] = useState(false);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  
  // Persistent panel sizing
  const [leftPanelWidthPx, setLeftPanelWidthPx] = useState<number>(300);
  const [rightPanelWidthPx, setRightPanelWidthPx] = useState<number>(400);
  const [draggingSide, setDraggingSide] = useState<'left' | 'right' | null>(null);
  const previousLeftWidthRef = useRef<number>(300);
  const windowWidthRef = useRef<number>(typeof window !== 'undefined' ? window.innerWidth : 1440);
  
  // Theme state
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  
  // File Results filters and state
  const [ratingFilter, setRatingFilter] = useState<string[]>(['all']);
  const [searchFilter, setSearchFilter] = useState('');
  const [sortField, setSortField] = useState<SortField>('rating');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [customFilters, setCustomFilters] = useState<CustomFilter[]>([]);
  const [visibleColumns, setVisibleColumns] = useState({
    rating: true,
    fullPath: true,
    creationTime: true,
    lastModified: true,
    size: true
  });

  // Memoize customFilters to prevent unnecessary re-renders when empty
  const stableCustomFilters = useMemo(() => customFilters, [JSON.stringify(customFilters)]);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Credentials filter state
  const [credentialsFilter, setCredentialsFilter] = useState(false);

  // File extension filter state
  const [fileExtensionFilter, setFileExtensionFilter] = useState<string[]>([]);

  const [loadedFileName, setLoadedFileName] = useState<string>('');
  const [loadedFileSize, setLoadedFileSize] = useState<string>('');

  // Stats for dashboard
  const [stats, setStats] = useState({
    total: 0,
    red: 0,
    yellow: 0,
    green: 0,
    black: 0
  });

  // Share Results state
  const [shareResults, setShareResults] = useState<any[]>([]);
  // GPO state
  const [GPOReport, setGPOReport] = useState<GPOReport | null>(null);
  
  // GPO Details state (for persistence across tab navigation)
  const [gpoSearch, setGpoSearch] = useState('');
  const [gpoLinkedFilter, setGpoLinkedFilter] = useState<string>('all');
  const [gpoSortField, setGpoSortField] = useState<'gpo' | 'settingsCount' | 'linked'>('gpo');
  const [gpoSortDirection, setGpoSortDirection] = useState<'asc' | 'desc'>('asc');
  const [gpoCurrentPage, setGpoCurrentPage] = useState(1);
  const [gpoPageSize, setGpoPageSize] = useState(50);
  const [selectedGPO, setSelectedGPO] = useState<any>(null);
  const [selectedGPOIndex, setSelectedGPOIndex] = useState<number>(-1);
  const [showGPORightPanel, setShowGPORightPanel] = useState(false);
  const [isGPOLeftPanelMinimized, setIsGPOLeftPanelMinimized] = useState(false);
  
  // GPO Settings state (for persistence across tab navigation)
  const [gpoSettingsSearch, setGpoSettingsSearch] = useState('');
  const [gpoSettingsScopeFilter, setGpoSettingsScopeFilter] = useState<string>('all');
  const [gpoSettingsCategoryFilter, setGpoSettingsCategoryFilter] = useState<string>('all');
  const [gpoSettingsCurrentPage, setGpoSettingsCurrentPage] = useState(1);
  const [gpoSettingsPageSize, setGpoSettingsPageSize] = useState(100);
  const [gpoSettingsSortField, setGpoSettingsSortField] = useState<'gpo' | 'scope' | 'category' | 'entries' | 'findings' | 'severity'>('severity');
  const [gpoSettingsSortDirection, setGpoSettingsSortDirection] = useState<'asc' | 'desc'>('desc');
  const [gpoSettingsSelectedIndex, setGpoSettingsSelectedIndex] = useState<number | null>(null);
  const [gpoSettingsShowExportDropdown, setGpoSettingsShowExportDropdown] = useState(false);
  const [isGpoSettingsLeftPanelMinimized, setIsGpoSettingsLeftPanelMinimized] = useState(false);
  
  // GPO panel width state (for persistence across tab navigation)
  const [gpoLeftPanelWidthPx, setGpoLeftPanelWidthPx] = useState<number>(300);
  const [gpoRightPanelWidthPx, setGpoRightPanelWidthPx] = useState<number>(400);
  const [gpoDetailsLeftPanelWidthPx, setGpoDetailsLeftPanelWidthPx] = useState<number>(300);
  const [gpoDetailsRightPanelWidthPx, setGpoDetailsRightPanelWidthPx] = useState<number>(400);
  
  // GPO scroll position state (for persistence across tab navigation)
  const [gpoListScrollTop, setGpoListScrollTop] = useState<number>(0);
  const [gpoSettingsScrollTop, setGpoSettingsScrollTop] = useState<number>(0);

  // Initialize GPO panel widths and scroll positions from localStorage
  useEffect(() => {
    const ww = window.innerWidth;
    const storedGpoLeftPct = getStoredPct('layout:gpo:leftPct', 300 / ww);
    const storedGpoRightPct = getStoredPct('layout:gpo:rightPct', 400 / ww);
    const storedGpoDetailsLeftPct = getStoredPct('layout:gpo-details:leftPct', 300 / ww);
    const storedGpoDetailsRightPct = getStoredPct('layout:gpo-details:rightPct', 400 / ww);
    
    setGpoLeftPanelWidthPx(Math.round(storedGpoLeftPct * ww));
    setGpoRightPanelWidthPx(Math.round(storedGpoRightPct * ww));
    setGpoDetailsLeftPanelWidthPx(Math.round(storedGpoDetailsLeftPct * ww));
    setGpoDetailsRightPanelWidthPx(Math.round(storedGpoDetailsRightPct * ww));
    
    // Initialize scroll positions from localStorage
    const storedGpoListScroll = getStoredPct('scroll:gpo-list', 0);
    const storedGpoSettingsScroll = getStoredPct('scroll:gpo-settings', 0);
    setGpoListScrollTop(storedGpoListScroll);
    setGpoSettingsScrollTop(storedGpoSettingsScroll);
  }, []);

  // Save GPO panel widths to localStorage
  useEffect(() => {
    const ww = window.innerWidth;
    if (ww > 0) {
      setStoredPct('layout:gpo:leftPct', gpoLeftPanelWidthPx / ww);
    }
  }, [gpoLeftPanelWidthPx]);

  useEffect(() => {
    const ww = window.innerWidth;
    if (ww > 0) {
      setStoredPct('layout:gpo:rightPct', gpoRightPanelWidthPx / ww);
    }
  }, [gpoRightPanelWidthPx]);

  useEffect(() => {
    const ww = window.innerWidth;
    if (ww > 0) {
      setStoredPct('layout:gpo-details:leftPct', gpoDetailsLeftPanelWidthPx / ww);
    }
  }, [gpoDetailsLeftPanelWidthPx]);

  useEffect(() => {
    const ww = window.innerWidth;
    if (ww > 0) {
      setStoredPct('layout:gpo-details:rightPct', gpoDetailsRightPanelWidthPx / ww);
    }
  }, [gpoDetailsRightPanelWidthPx]);

  // Save GPO scroll positions to localStorage
  useEffect(() => {
    setStoredPct('scroll:gpo-list', gpoListScrollTop);
  }, [gpoListScrollTop]);

  useEffect(() => {
    setStoredPct('scroll:gpo-settings', gpoSettingsScrollTop);
  }, [gpoSettingsScrollTop]);
  
  
  // Duplicate statistics state
  const [duplicateStats, setDuplicateStats] = useState<any>(null);

  // Error state
  const [errorInfo, setErrorInfo] = useState<{ message: string; snippet?: string; errorPosition?: number; fileName?: string; fileType?: string; actualLineNumber?: number; snippetStartLine?: number } | null>(null);

  // False positive state
  const [falsePositives, setFalsePositives] = useState<Set<string>>(new Set());

  // Export dropdown state
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  // Refs
  const filtersPanelRef = useRef<HTMLDivElement>(null);
  const prevCustomFiltersRef = useRef<CustomFilter[]>([]);
  const leftResizerRef = useRef<HTMLDivElement>(null);
  const rightResizerRef = useRef<HTMLDivElement>(null);

  // Helpers for persistence
  const getStoredPct = (key: string, fallback: number) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      const num = parseFloat(raw);
      return isNaN(num) ? fallback : num;
    } catch {
      return fallback;
    }
  };

  const setStoredPct = (key: string, value: number) => {
    try {
      localStorage.setItem(key, String(value));
    } catch {}
  };

  // Initialize panel sizes from stored proportions
  useEffect(() => {
    const ww = window.innerWidth;
    windowWidthRef.current = ww;
    const storedLeftPct = getStoredPct('layout:leftPct', 300 / ww);
    const storedRightPct = getStoredPct('layout:rightPct', 400 / ww);
    const MIN_LEFT = 180;
    const MIN_RIGHT = 280;
    const MIN_CENTER = 480;
    const computedRight = Math.round(storedRightPct * ww);
    const maxLeft = Math.max(MIN_LEFT, ww - (showRightPanel ? computedRight : 0) - MIN_CENTER);
    const newLeft = Math.max(MIN_LEFT, Math.min(Math.round(storedLeftPct * ww), maxLeft));
    const maxRight = Math.max(MIN_RIGHT, ww - newLeft - MIN_CENTER);
    const newRight = Math.max(MIN_RIGHT, Math.min(computedRight, maxRight));
    setLeftPanelWidthPx(newLeft);
    setRightPanelWidthPx(newRight);
    // Keep reference for un-minimize
    previousLeftWidthRef.current = Math.max(MIN_LEFT, Math.round(storedLeftPct * ww));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recompute sizes on window resize to maintain proportions
  useEffect(() => {
    const onResize = () => {
      const ww = window.innerWidth;
      const leftPct = leftPanelWidthPx / windowWidthRef.current;
      const rightPct = rightPanelWidthPx / windowWidthRef.current;
      windowWidthRef.current = ww;
      const MIN_LEFT = 180;
      const MIN_RIGHT = 280;
      const MIN_CENTER = 480;
      const computedLeft = Math.round(leftPct * ww);
      const computedRight = Math.round(rightPct * ww);
      const maxLeft = Math.max(MIN_LEFT, ww - (showRightPanel ? computedRight : 0) - MIN_CENTER);
      setLeftPanelWidthPx(Math.max(MIN_LEFT, Math.min(computedLeft, maxLeft)));
      if (showRightPanel) {
        const maxRight = Math.max(MIN_RIGHT, ww - leftPanelWidthPx - MIN_CENTER);
        setRightPanelWidthPx(Math.max(MIN_RIGHT, Math.min(computedRight, maxRight)));
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [leftPanelWidthPx, rightPanelWidthPx, showRightPanel]);

  // Clamp sizes when right panel visibility changes
  useEffect(() => {
    const ww = window.innerWidth;
    const MIN_LEFT = 180;
    const MIN_RIGHT = 280;
    const MIN_CENTER = 480;
    if (showRightPanel) {
      const maxLeft = Math.max(MIN_LEFT, ww - rightPanelWidthPx - MIN_CENTER);
      setLeftPanelWidthPx(prev => Math.max(MIN_LEFT, Math.min(prev, maxLeft)));
      const maxRight = Math.max(MIN_RIGHT, ww - (isLeftPanelMinimized ? 50 : leftPanelWidthPx) - MIN_CENTER);
      setRightPanelWidthPx(prev => Math.max(MIN_RIGHT, Math.min(prev, maxRight)));
    } else {
      // No right panel: ensure center >= MIN_CENTER still holds for left width
      const maxLeft = Math.max(MIN_LEFT, ww - MIN_CENTER);
      setLeftPanelWidthPx(prev => Math.max(MIN_LEFT, Math.min(prev, maxLeft)));
    }
  }, [showRightPanel, isLeftPanelMinimized, leftPanelWidthPx, rightPanelWidthPx]);

  // Persist proportions when sizes change
  useEffect(() => {
    const ww = windowWidthRef.current || window.innerWidth;
    if (ww > 0) {
      setStoredPct('layout:leftPct', leftPanelWidthPx / ww);
    }
  }, [leftPanelWidthPx]);
  useEffect(() => {
    const ww = windowWidthRef.current || window.innerWidth;
    if (ww > 0) {
      setStoredPct('layout:rightPct', rightPanelWidthPx / ww);
    }
  }, [rightPanelWidthPx]);

  // Drag handling
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingSide) return;
      const ww = window.innerWidth;
      const MIN_LEFT = 180;
      const MIN_RIGHT = 280;
      const MIN_CENTER = 480;
      if (draggingSide === 'left') {
        if (isLeftPanelMinimized) return;
        let newLeft = e.clientX; // distance from left edge
        // Clamp to min and ensure center maintains min width
        const maxLeft = ww - (showRightPanel ? rightPanelWidthPx : 0) - MIN_CENTER;
        newLeft = Math.max(MIN_LEFT, Math.min(newLeft, maxLeft));
        setLeftPanelWidthPx(newLeft);
        previousLeftWidthRef.current = newLeft;
      } else if (draggingSide === 'right') {
        if (!showRightPanel) return;
        // right width is window width - mouseX
        let newRight = ww - e.clientX;
        const maxRight = ww - (isLeftPanelMinimized ? 50 : leftPanelWidthPx) - MIN_CENTER;
        newRight = Math.max(MIN_RIGHT, Math.min(newRight, maxRight));
        setRightPanelWidthPx(newRight);
      }
    };
    const onMouseUp = () => {
      if (draggingSide) setDraggingSide(null);
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [draggingSide, isLeftPanelMinimized, leftPanelWidthPx, rightPanelWidthPx, showRightPanel]);

  const handleFileUpload = (data: any, fileType: 'json' | 'text' | 'log', fileName: string, fileSize?: string) => {
    // Helper: detect GPO in plaintext
    const looksLikeGPO = (text: string) => {
      return /\[GPO\]/.test(text) && (/^\s*\|.*\|/m.test(text) || /\\___/.test(text));
    };

    try {
      if (fileType !== 'json') {
        const rawText = Array.isArray(data) ? String(data[0]) : String(data);
        if (looksLikeGPO(rawText)) {
          const report = parseGPO(rawText);
          // Persist GPO state
          setGPOReport(report);
          setLoadedFileName(fileName);
          setLoadedFileSize(fileSize || '');
          // Clear Snaffler state when loading GPO-only file
          setAllResults([]);
          setShareResults([]);
          
          // Calculate total GPO settings count
          const totalSettings = report.gpos.reduce((total, gpo) => total + gpo.settings.length, 0);
          setStats({ 
            total: totalSettings, 
            red: 0, 
            yellow: 0, 
            green: 0, 
            black: 0 
          });
          
          setDuplicateStats(null);
          setCurrentView('dashboard');
          return;
        }
      }

      // Default to Snaffler parsing
      const parseResult = parseSnafflerData(data, fileType);
      const results = parseResult.results;
      const duplicateStats = parseResult.duplicateStats;
      
      setAllResults(results);
      setLoadedFileName(fileName);
      setLoadedFileSize(fileSize || '');
      setCurrentView('dashboard');
      setGPOReport(null);
      
      if (duplicateStats && duplicateStats.duplicatesRemoved > 0) {
        console.log(`Duplicate detection: ${duplicateStats.duplicatesRemoved} duplicates removed (${duplicateStats.duplicatePercentage}% of total)`);
        setDuplicateStats(duplicateStats);
      } else {
        setDuplicateStats(null);
      }
      
      const newStats = {
        total: results.length,
        red: results.filter((r: FileResult) => r.rating.toLowerCase() === 'red').length,
        yellow: results.filter((r: FileResult) => r.rating.toLowerCase() === 'yellow').length,
        green: results.filter((r: FileResult) => r.rating.toLowerCase() === 'green').length,
        black: results.filter((r: FileResult) => r.rating.toLowerCase() === 'black').length
      };
      setStats(newStats);
      
      const shares = parseShareData(data, fileType);
      setShareResults(shares);
    } catch (e) {
      // Let outer error handling display the error
      throw e;
    }
  };

  const handleReset = () => {
    // Clear all results and data
    setAllResults([]);
    setSelectedResult(null);
    setShowRightPanel(false);
    setLoadedFileName('');
    setLoadedFileSize('');
    setCurrentView('dashboard');
    setStats({
      total: 0,
      red: 0,
      yellow: 0,
      green: 0,
      black: 0
    });
    setShareResults([]);
    setGPOReport(null);
    setDuplicateStats(null);
    setErrorInfo(null);
    
    // Clear GPO state
    setGpoSearch('');
    setGpoLinkedFilter('all');
    setGpoSortField('gpo');
    setGpoSortDirection('asc');
    setGpoCurrentPage(1);
    setGpoPageSize(50);
    setSelectedGPO(null);
    setSelectedGPOIndex(-1);
    setShowGPORightPanel(false);
    setIsGPOLeftPanelMinimized(false);
    
    // Clear GPO Settings state
    setGpoSettingsSearch('');
    setGpoSettingsScopeFilter('all');
    setGpoSettingsCategoryFilter('all');
    setGpoSettingsCurrentPage(1);
    setGpoSettingsPageSize(100);
    setGpoSettingsSortField('severity');
    setGpoSettingsSortDirection('desc');
    setGpoSettingsSelectedIndex(null);
    setGpoSettingsShowExportDropdown(false);
    setIsGpoSettingsLeftPanelMinimized(false);
    
    // Clear localStorage
    try {
      localStorage.clear();
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }
    
    // Reset all filters and search
    setRatingFilter(['all']);
    setSearchFilter('');
    setFileExtensionFilter([]);
    setCustomFilters([]);
    setCredentialsFilter(false);
    setFalsePositives(new Set());
    
    // Reset sorting to default
    setSortField('rating');
    setSortDirection('desc');
    
    // Reset pagination
    setCurrentPage(1);
    setPageSize(100);
    
    // Reset column visibility
    setVisibleColumns({
      rating: true,
      fullPath: true,
      creationTime: true,
      lastModified: true,
      size: true
    });
    
    // Reset panel state
    setIsLeftPanelMinimized(false);
    
    // Clear the file input so the same file can be selected again
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleClearError = () => {
    handleReset();
  };

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const handleSelectResult = (result: FileResult) => {
    setSelectedResult(result);
    setShowRightPanel(true);
  };

  const handleCloseRightPanel = () => {
    setShowRightPanel(false);
    setSelectedResult(null);
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const processFile = (file: File) => {
    const fileType = file.name.endsWith('.json') ? 'json' : (file.name.endsWith('.log') ? 'log' : 'text');
    const fileSize = formatFileSize(file.size);
    file.text().then(text => {
      try {
        setErrorInfo(null);
        if (fileType === 'json') {
          const jsonData = JSON.parse(text);
          handleFileUpload(jsonData, 'json', file.name, fileSize);
        } else {
          handleFileUpload([text], fileType, file.name, fileSize);
        }
      } catch (error: any) {
        console.error('Error processing file:', error);
        let snippet = '';
        let errorPosition: number | undefined;
        let tempErrorLineInfo: { actualErrorLine?: number; snippetStartLine?: number } = {};

        if (fileType === 'json') {
          let match: RegExpMatchArray | null = null;
          const lineColumnMatch = error.message.match(/line (\d+) column (\d+)/);
          if (lineColumnMatch) {
            const lineNum = parseInt(lineColumnMatch[1], 10);
            const colNum = parseInt(lineColumnMatch[2], 10);
            const lines = text.split('\n');
            let position = 0;
            const targetLine = Math.min(lineNum - 1, lines.length - 1);
            for (let i = 0; i < targetLine; i++) {
              position += lines[i].length + 1;
            }
            position += colNum - 1;
            match = [null as any, position.toString()] as any;
          }
          if (!match) match = error.message.match(/position (\d+)/);
          if (!match) match = error.message.match(/at position (\d+)/);
          if (!match) match = error.message.match(/column (\d+)/);

          if (match) {
            const absolutePosition = parseInt(match[1], 10);
            let start: number, end: number, actualErrorLine: number | undefined, snippetStartLine: number | undefined;
            if (lineColumnMatch) {
              const lineNum = parseInt(lineColumnMatch[1], 10);
              const lines = text.split('\n');
              const startLine = Math.max(0, lineNum - 3);
              const endLine = Math.min(lines.length, lineNum + 2);
              start = 0;
              for (let i = 0; i < startLine; i++) start += lines[i].length + 1;
              end = start;
              for (let i = startLine; i < endLine; i++) end += lines[i].length + 1;
              end = Math.min(text.length, end);
              actualErrorLine = lineNum;
              snippetStartLine = startLine + 1;
            } else {
              start = Math.max(0, absolutePosition - 150);
              end = Math.min(text.length, absolutePosition + 150);
            }
            snippet = text.substring(start!, end!);
            let relativePosition = absolutePosition - start!;
            if (start! > 0) { snippet = '...' + snippet; relativePosition += 3; }
            if (end! < text.length) { snippet = snippet + '...'; }
            errorPosition = relativePosition;
            tempErrorLineInfo = { actualErrorLine, snippetStartLine };
          } else {
            const errorMsg = (error.message || '').toLowerCase();
            if (errorMsg.includes('unexpected end') || errorMsg.includes('unterminated') || errorMsg.includes('expected') || errorMsg.includes('eof') || errorMsg.includes('end of') || errorMsg.includes('missing') || errorMsg.includes('incomplete')) {
              const start = Math.max(0, text.length - 300);
              snippet = text.substring(start);
              if (start > 0) snippet = '...' + snippet;
              errorPosition = text.length - (text.length - start);
            } else {
              snippet = text.substring(0, 300);
              if (text.length > 300) snippet = snippet + '...';
            }
          }
        } else {
          snippet = text.substring(0, 300);
          if (text.length > 300) snippet = snippet + '...';
        }

        setErrorInfo({
          message: (error as any).message || 'An unknown error occurred while processing the file.',
          snippet,
          errorPosition,
          fileName: file.name,
          fileType,
          actualLineNumber: tempErrorLineInfo?.actualErrorLine,
          snippetStartLine: tempErrorLineInfo?.snippetStartLine
        });
      }
    }).catch(error => {
      console.error('Error reading file:', error);
      setErrorInfo({
        message: 'Error reading file. Please check if the file is corrupted or unreadable.',
        fileName: file.name,
        fileType
      });
    });
  };


  // Handle click outside to close column dropdown and export dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const columnDropdown = document.getElementById('column-dropdown');
      if (columnDropdown && !columnDropdown.contains(event.target as Node)) {
        columnDropdown.classList.remove('show');
      }
      
      const exportDropdown = document.getElementById('export-dropdown');
      if (exportDropdown && !exportDropdown.contains(event.target as Node)) {
        setShowExportDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Only handle shortcuts when not typing in input fields
      const activeElement = document.activeElement;
      const isTyping = activeElement && (
        activeElement.tagName === 'INPUT' || 
        activeElement.tagName === 'TEXTAREA' || 
        (activeElement as HTMLElement).contentEditable === 'true'
      );
      
      if (isTyping) return;

      // F key to toggle false positive
      if (event.key.toLowerCase() === 'f' && selectedResult) {
        event.preventDefault();
        handleToggleFalsePositive(selectedResult);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedResult]);

  const handleToggleLeftPanel = () => {
    setIsLeftPanelMinimized(prev => {
      const next = !prev;
      if (next) {
        // minimizing: remember current
        previousLeftWidthRef.current = leftPanelWidthPx;
        setLeftPanelWidthPx(50);
      } else {
        // restoring: use previous width, respecting constraints
        const ww = window.innerWidth;
        const MIN_LEFT = 180;
        const MIN_CENTER = 480;
        const maxLeft = ww - (showRightPanel ? rightPanelWidthPx : 0) - MIN_CENTER;
        const restored = Math.max(MIN_LEFT, Math.min(previousLeftWidthRef.current || 300, maxLeft));
        setLeftPanelWidthPx(restored);
      }
      return next;
    });
  };

  // Dashboard navigation and filtering functions
  const handleNavigateToResults = () => {
    setCurrentView('file-results');
  };

  const handleFilterBySystem = (systemId: string) => {
    setSearchFilter(systemId);
    setRatingFilter(['all']); // Reset rating filter
    setCustomFilters([]); // Reset custom filters
  };

  const handleFilterByShare = (sharePath: string) => {
    setSearchFilter(sharePath);
    setRatingFilter(['all']); // Reset rating filter
    setCustomFilters([]); // Reset custom filters
  };

  const handleFilterByExtension = (extension: string) => {
    setFileExtensionFilter([extension]);
    setSearchFilter(''); // Clear search filter
    setRatingFilter(['all']); // Reset rating filter
    setCustomFilters([]); // Reset custom filters
  };

  const handleSelectFile = (file: FileResult) => {
    setSelectedResult(file);
    setShowRightPanel(true);
    // Also filter to show only this file
    setSearchFilter(file.fileName);
    setRatingFilter(['all']); // Reset rating filter
    setCustomFilters([]); // Reset custom filters
  };

  // Filter and sort results
  useEffect(() => {
    
    let filtered = allResults;
    
    // Apply rating filter
    if (!ratingFilter.includes('all')) {
      filtered = filtered.filter(result => 
        ratingFilter.includes(result.rating.toLowerCase())
      );
    }
    
    // Apply search filter
    if (searchFilter) {
      const searchLower = searchFilter.toLowerCase();
      filtered = filtered.filter(result => 
        result.fileName.toLowerCase().includes(searchLower) ||
        result.fullPath.toLowerCase().includes(searchLower) ||
        result.matchContext.toLowerCase().includes(searchLower) ||
        result.matchedStrings.some(str => str.toLowerCase().includes(searchLower))
      );
    }
    
    // Apply file extension filter
    if (fileExtensionFilter.length > 0) {
      filtered = filtered.filter(result => {
        const fileName = result.fileName.toLowerCase();
        return fileExtensionFilter.some(extension => 
          fileName.endsWith(`.${extension}`)
        );
      });
    }
    
    // Apply credentials filter
    if (credentialsFilter) {
      filtered = filtered.filter(result => {
        const searchText = [
          result.matchContext,
          ...result.matchedStrings
        ].join(' ').toLowerCase();
        
        return CREDENTIALS_KEYWORDS.some(keyword => 
          searchText.includes(keyword.toLowerCase())
      );
      });
    }
    
    // Apply custom filters
    if (stableCustomFilters.length > 0) {
      filtered = filtered.filter(result => {
        const resultText = [
          result.fileName,
          result.fullPath,
          result.matchContext,
          ...result.matchedStrings
        ].join(' ').toLowerCase();
        
        // Exclude if any custom filter text is found in the result
        return !stableCustomFilters.some(filter => 
          resultText.includes(filter.text.toLowerCase())
        );
      });
    }
    
    // Sort results
    const sortedResults = filtered.sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];
      
      if (sortField === 'rating') {
          // Handle rating sorting with proper severity order (Black > Red > Yellow > Green)
        const ratingOrder: Record<string, number> = { 'Black': 4, 'Red': 3, 'Yellow': 2, 'Green': 1 };
        aValue = ratingOrder[aValue] || 0;
        bValue = ratingOrder[bValue] || 0;
      } else if (sortField === 'size') {
        aValue = parseInt(aValue) || 0;
        bValue = parseInt(bValue) || 0;
      } else if (sortField === 'creationTime' || sortField === 'lastModified') {
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
      } else {
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
      }
      
      // Primary sort
      if (sortDirection === 'asc') {
        if (aValue !== bValue) {
          return aValue > bValue ? 1 : -1;
        }
      } else {
        if (aValue !== bValue) {
          return aValue < bValue ? 1 : -1;
        }
      }
      
      // Secondary sort by fileName to ensure stable ordering
      const aFileName = String(a.fileName).toLowerCase();
      const bFileName = String(b.fileName).toLowerCase();
      if (aFileName !== bFileName) {
        return aFileName > bFileName ? 1 : -1;
      }
      
      // Tertiary sort by fullPath for complete stability
      const aPath = String(a.fullPath).toLowerCase();
      const bPath = String(b.fullPath).toLowerCase();
      return aPath > bPath ? 1 : -1;
    });
    
    setFilteredResults([...sortedResults]);
    
    // Reset to first page when filters change
    setCurrentPage(1);
  }, [allResults, ratingFilter, searchFilter, fileExtensionFilter, credentialsFilter, stableCustomFilters, sortField, sortDirection]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredResults.length / pageSize);
  const currentPageData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredResults.slice(startIndex, endIndex);
  }, [filteredResults, currentPage, pageSize]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  // Theme toggle handler
  const handleThemeToggle = () => {
    setIsDarkTheme(!isDarkTheme);
    document.documentElement.setAttribute('data-theme', !isDarkTheme ? 'light' : 'dark');
  };

  // Handle toggling false positive status
  const handleToggleFalsePositive = (result: FileResult) => {
    const key = `${result.fullPath}-${result.fileName}`;
    setFalsePositives(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };

  // Unified export handlers for current view
  const handleExportCSV = async () => {
    if (currentView === 'file-results') {
      exportFileResultsToCSV(filteredResults, visibleColumns, falsePositives);
    } else if (currentView === 'share-results') {
      exportShareResultsToCSV(shareResults);
    } else if (currentView === 'GPO-results' && GPOReport) {
      exportGPOToCSV(GPOReport);
    }
  };

  const handleExportXLSX = async () => {
    if (currentView === 'file-results') {
      await exportFileResultsToXLSX(allResults, filteredResults, visibleColumns, falsePositives, stats, loadedFileName);
    } else if (currentView === 'share-results') {
      await exportShareResultsToXLSX(shareResults);
    } else if (currentView === 'GPO-results' && GPOReport) {
      await exportGPOToXLSX(GPOReport);
    }
  };

  // XLSX Export function
  const exportToXLSX = async () => {
    // Filter out false positive
    const exportResults = filteredResults.filter(result => {
      const key = `${result.fullPath}-${result.fileName}`;
      return !falsePositives.has(key);
    });
    
    if (exportResults.length === 0) return;

    const workbook = new ExcelJS.Workbook();
    
    // Create "Information" worksheet
    const infoSheet = workbook.addWorksheet('Information');
    
    // Get basic information about the data
    const dateStr = new Date().toLocaleString();
    const totalFiles = allResults.length;
    const filteredFiles = exportResults.length;
    const falsePositiveCount = falsePositives.size;
    const ratingColors = {
      "Black": "FF000000",
      "Red": "FFFF0000",
      "Yellow": "FFFFFF00",
      "Green": "FF00FF00"
    };
    
    // Style the information sheet
    infoSheet.columns = [
      { header: "Chimas Information", key: "property", width: 40 },
      { header: "", key: "value", width: 40 }
    ];
    
    // Add information rows
    const infoData = [
      { property: "Export Date", value: dateStr },
      { property: "Total Files Found", value: totalFiles.toString() },
      { property: "Files in Export", value: filteredFiles.toString() },
      { property: "False Positives Excluded", value: falsePositiveCount.toString() },
      { property: "Red Findings", value: stats.red.toString() },
      { property: "Yellow Findings", value: stats.yellow.toString() },
      { property: "Green Findings", value: stats.green.toString() },
      { property: "Black Findings", value: stats.black.toString() },
      { property: "Source File", value: loadedFileName || "Unknown" }
    ];
    
    infoSheet.addRows(infoData);
    
    // Style the header row
    infoSheet.getRow(1).font = { bold: true };

    for (var cellIdx of [ "A1", "B1" ]) {
      infoSheet.getCell(cellIdx).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FFE0E0E0' }
      };
    }
    
    // Add Results worksheet
    const resultsSheet = workbook.addWorksheet('Results');
    const headers: any[] = [];
    const colKeys: string[] = [];
    
    if (visibleColumns.rating) {
      headers.push({ header: 'Rating', key: 'rating', width: 10 });
      colKeys.push('rating');
    }

    if (visibleColumns.fullPath) {
      headers.push({ header: 'Full Path', key: 'fullPath', width: 60 });
      colKeys.push('fullPath');
    }

    if (visibleColumns.creationTime) {
      headers.push({ header: 'Creation Time', key: 'creationTime', width: 20 });
      colKeys.push('creationTime');
    }

    if (visibleColumns.lastModified) {
      headers.push({ header: 'Last Modified', key: 'lastModified', width: 20 });
      colKeys.push('lastModified');
    }

    if (visibleColumns.size) {
      headers.push({ header: 'Size', key: 'size', width: 12 });
      colKeys.push('size');
    }
    
    resultsSheet.columns = headers;
    
    // Helper function to format date
    const formatDate = (dateString: string) => {
      try {
        return format(new Date(dateString), 'dd/MM/yyyy HH:mm:ss');
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
    
    // Add data rows like CSV
    exportResults.forEach((result, index) => {
      const rowData: any = {};
      
      if (visibleColumns.rating) rowData.rating = result.rating;
      if (visibleColumns.fullPath) rowData.fullPath = result.fullPath;
      if (visibleColumns.creationTime) rowData.creationTime = formatDate(result.creationTime);
      if (visibleColumns.lastModified) rowData.lastModified = formatDate(result.lastModified);
      if (visibleColumns.size) rowData.size = formatFileSize(result.size);
      
      const row = resultsSheet.addRow(rowData);
      
      // Color code the rating cell
      if (visibleColumns.rating && result.rating) {
        const ratingColumnIndex = colKeys.indexOf('rating') + 1;
        const cell = row.getCell(ratingColumnIndex);
        
        // Set background color based on rating
        switch (result.rating.toLowerCase()) {
          case "red":
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: ratingColors.Red }
            };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            break;
            
          case "yellow":
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: ratingColors.Yellow }
            };
            cell.font = { bold: true };
            break;

          case "green":
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: ratingColors.Green }
            };
            cell.font = { bold: true };
            break;

          case "black":
            cell.fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: ratingColors.Black }
            };
            cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
            break;
        }
      }
    });
    
    // Header row styling
    for (var cellI = 0; cellI < headers.length; cellI++) { 
      let cellChar = String.fromCharCode(65 + cellI);
      let cellIdx = `${cellChar}1`;
      resultsSheet.getCell(cellIdx).font = { bold: true };
      resultsSheet.getCell(cellIdx).fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: 'FF4472C4' }
      };
      resultsSheet.getCell(cellIdx).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    }
    
    // Add filter 
    resultsSheet.autoFilter = {
      from: "A1",
      to: `${String.fromCharCode(64 + headers.length)}${exportResults.length + 1}`
    };
    
    resultsSheet.views = [
      { state: "frozen", ySplit: 1 }
    ];
    
    // Generate / download the file
    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], { 
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" 
    });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    
    link.setAttribute("href", url);
    link.setAttribute("download", `snaffler-results-${new Date().toISOString().split('T')[0]}.xlsx`);
    link.style.visibility = "hidden";

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDarkTheme ? 'dark' : 'light');
  }, [isDarkTheme]);

  // Initialize theme on app load
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', 'dark');
  }, []);

  const renderCurrentView = () => {
    switch (currentView) {
      case 'dashboard':
        return (
          <div className="dashboard-container">
            {GPOReport ? (
              <GPODashboard report={GPOReport} />
            ) : (
              <Dashboard 
                stats={stats} 
                allResults={allResults} 
                shareResults={shareResults}
                credentialsKeywords={CREDENTIALS_KEYWORDS}
                onNavigateToResults={handleNavigateToResults}
                onFilterBySystem={handleFilterBySystem}
                onFilterByShare={handleFilterByShare}
                onFilterByExtension={handleFilterByExtension}
                onSelectFile={handleSelectFile}
              />
            )}
          </div>
        );
      
      case 'file-results':
        return (
          <div className="main-content">
            <div 
              className={`left-panel ${isLeftPanelMinimized ? 'minimized' : ''}`} 
              ref={filtersPanelRef}
              style={{ width: isLeftPanelMinimized ? 50 : leftPanelWidthPx }}
            >
              <div className="panel-header">
                <span>Filters</span>
                <button className="minimize-button" onClick={handleToggleLeftPanel}>
                  <i className={`fas fa-chevron-${isLeftPanelMinimized ? 'right' : 'left'}`}></i>
                </button>
              </div>
              <div className="panel-content">
                <Filters
                  ratingFilter={ratingFilter}
                  searchFilter={searchFilter}
                  fileExtensionFilter={fileExtensionFilter}
                  sortField={sortField}
                  sortDirection={sortDirection}
                  customFilters={stableCustomFilters}
                  credentialsFilter={credentialsFilter}
                  onRatingFilterChange={setRatingFilter}
                  onSearchFilterChange={setSearchFilter}
                  onFileExtensionFilterChange={setFileExtensionFilter}
                  onSortFieldChange={setSortField}
                  onSortDirectionChange={setSortDirection}
                  onCustomFiltersChange={setCustomFilters}
                  onCredentialsFilterChange={setCredentialsFilter}
                  stats={stats}
                  isMinimized={isLeftPanelMinimized}
                />
              </div>
            </div>

            <div 
              className={`center-panel ${isLeftPanelMinimized ? 'expanded' : ''} ${showRightPanel ? 'with-right-panel' : ''}`}
              style={{ 
                left: isLeftPanelMinimized ? 50 : leftPanelWidthPx, 
                right: showRightPanel ? rightPanelWidthPx : 0 
              }}
            >
              <div className="table-container">
                <div className="table-header">
                  <div className="table-header-content">
                    <div className="search-container">
                      <div className="search-input-wrapper">
                        <input
                          id="search-filter"
                          type="text"
                          placeholder="Search files, paths, or content..."
                          value={searchFilter}
                          onChange={(e) => setSearchFilter(e.target.value)}
                        />
                        {searchFilter && (
                          <button 
                            className="search-clear-button"
                            onClick={() => setSearchFilter('')}
                            type="button"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="table-controls">
                      <div className="column-visibility-dropdown">
                        <button 
                          className="column-visibility-button"
                          onClick={() => {
                            const dropdown = document.getElementById('column-dropdown');
                            dropdown?.classList.toggle('show');
                          }}
                        >
                          <span className="button-text">Columns</span>
                          <span className="dropdown-arrow">
                            <i className="fas fa-chevron-down"></i>
                          </span>
                        </button>
                        <div id="column-dropdown" className="column-dropdown-menu">
                          <div className="column-dropdown-item">
                            <label>
                              <input
                                type="checkbox"
                                checked={visibleColumns.rating}
                                onChange={(e) => setVisibleColumns(prev => ({
                                  ...prev,
                                  rating: e.target.checked
                                }))}
                              />
                              Rating
                            </label>
                          </div>
                          <div className="column-dropdown-item">
                            <label>
                              <input
                                type="checkbox"
                                checked={visibleColumns.fullPath}
                                onChange={(e) => setVisibleColumns(prev => ({
                                  ...prev,
                                  fullPath: e.target.checked
                                }))}
                              />
                              Full Path
                            </label>
                          </div>
                          <div className="column-dropdown-item">
                            <label>
                              <input
                                type="checkbox"
                                checked={visibleColumns.creationTime}
                                onChange={(e) => setVisibleColumns(prev => ({
                                  ...prev,
                                  creationTime: e.target.checked
                                }))}
                              />
                              Creation Time
                            </label>
                          </div>
                          <div className="column-dropdown-item">
                            <label>
                              <input
                                type="checkbox"
                                checked={visibleColumns.lastModified}
                                onChange={(e) => setVisibleColumns(prev => ({
                                  ...prev,
                                  lastModified: e.target.checked
                                }))}
                              />
                              Last Modified
                            </label>
                          </div>
                          <div className="column-dropdown-item">
                            <label>
                              <input
                                type="checkbox"
                                checked={visibleColumns.size}
                                onChange={(e) => setVisibleColumns(prev => ({
                                  ...prev,
                                  size: e.target.checked
                                }))}
                              />
                              Size
                            </label>
                          </div>
                        </div>
                      </div>
                      <div className="export-dropdown-container" id="export-dropdown">
                        <button 
                          className="action-button dropdown-button"
                          onClick={() => setShowExportDropdown(!showExportDropdown)}
                          disabled={filteredResults.length === 0}
                          title="Export current results"
                        >
                          <i className="fas fa-download button-icon"></i>
                          Export
                          <i className="fas fa-chevron-down dropdown-arrow"></i>
                        </button>
                        {showExportDropdown && (
                          <div className="export-dropdown-menu">
                            <button 
                              className="export-dropdown-item"
                              title="Export current results to CSV"
                              onClick={async () => {
                                await handleExportCSV();
                                setShowExportDropdown(false);
                              }}
                            >
                              <i className="fas fa-file-csv"></i>
                              Export CSV
                            </button>
                            <button 
                              className="export-dropdown-item"
                              title="Export current results to XLSX"
                              onClick={async () => {
                                await handleExportXLSX();
                                setShowExportDropdown(false);
                              }}
                            >
                              <i className="fas fa-file-excel"></i>
                              Export XLSX
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="results-count">
                        Showing {filteredResults.length} of {allResults.length} files
                        {falsePositives.size > 0 && (
                          <span className="false-positive-count">
                            ({falsePositives.size} marked as false positive)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                <div className="table-wrapper">
                  <ResultsTable
                    results={currentPageData}
                    selectedResult={selectedResult}
                    onSelectResult={handleSelectResult}
                    sortField={sortField}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    visibleColumns={visibleColumns}
                    currentPage={currentPage}
                    pageSize={pageSize}
                    totalPages={totalPages}
                    totalResults={filteredResults.length}
                    onPageChange={handlePageChange}
                    onPageSizeChange={handlePageSizeChange}
                    falsePositives={falsePositives}
                  />
                </div>
              </div>
            </div>

            <div 
              className={`right-panel ${!showRightPanel ? 'hidden' : ''}`}
              style={{ width: rightPanelWidthPx }}
            >
              <div className="panel-header">
                <span>Details</span>
                <button className="close-button" onClick={handleCloseRightPanel}>
                  ×
                </button>
              </div>
              <div className="panel-content">
                <DetailPanel 
                  selectedResult={selectedResult} 
                  onClose={handleCloseRightPanel}
                  onToggleFalsePositive={handleToggleFalsePositive}
                  falsePositives={falsePositives}
                />
              </div>
            </div>

            {/* Resizers */}
            <div 
              ref={leftResizerRef}
              className={`resizer resizer-left ${isLeftPanelMinimized ? 'hidden' : ''} ${draggingSide === 'left' ? 'dragging' : ''}`}
              style={{ left: isLeftPanelMinimized ? 50 : leftPanelWidthPx }}
              onMouseDown={(e) => { e.preventDefault(); setDraggingSide('left'); }}
            />
            <div 
              ref={rightResizerRef}
              className={`resizer resizer-right ${showRightPanel ? '' : 'hidden'} ${draggingSide === 'right' ? 'dragging' : ''}`}
              style={{ right: rightPanelWidthPx }}
              onMouseDown={(e) => { e.preventDefault(); setDraggingSide('right'); }}
            />
          </div>
        );
      
      case 'share-results':
        return (
          <div className="share-results-container">
            <ShareResults shareResults={shareResults} />
          </div>
        );
      case 'GPO-results':
        return (
          <>
            {GPOReport && (
              <GPOResults 
                report={GPOReport}
                search={gpoSettingsSearch}
                setSearch={setGpoSettingsSearch}
                scopeFilter={gpoSettingsScopeFilter}
                setScopeFilter={setGpoSettingsScopeFilter}
                categoryFilter={gpoSettingsCategoryFilter}
                setCategoryFilter={setGpoSettingsCategoryFilter}
                currentPage={gpoSettingsCurrentPage}
                setCurrentPage={setGpoSettingsCurrentPage}
                pageSize={gpoSettingsPageSize}
                setPageSize={setGpoSettingsPageSize}
                sortField={gpoSettingsSortField}
                setSortField={setGpoSettingsSortField}
                sortDirection={gpoSettingsSortDirection}
                setSortDirection={setGpoSettingsSortDirection}
                selectedIndex={gpoSettingsSelectedIndex}
                setSelectedIndex={setGpoSettingsSelectedIndex}
                showExportDropdown={gpoSettingsShowExportDropdown}
                setShowExportDropdown={setGpoSettingsShowExportDropdown}
                isLeftPanelMinimized={isGpoSettingsLeftPanelMinimized}
                setIsLeftPanelMinimized={setIsGpoSettingsLeftPanelMinimized}
                leftPanelWidthPx={gpoLeftPanelWidthPx}
                setLeftPanelWidthPx={setGpoLeftPanelWidthPx}
                rightPanelWidthPx={gpoRightPanelWidthPx}
                setRightPanelWidthPx={setGpoRightPanelWidthPx}
                scrollTop={gpoSettingsScrollTop}
                setScrollTop={setGpoSettingsScrollTop}
              />
            )}
          </>
        );
      
      case 'GPO-details':
        return (
          <>
            {GPOReport && (
              <GPODetails 
                report={GPOReport}
                search={gpoSearch}
                setSearch={setGpoSearch}
                linkedFilter={gpoLinkedFilter}
                setLinkedFilter={setGpoLinkedFilter}
                sortField={gpoSortField}
                setSortField={setGpoSortField}
                sortDirection={gpoSortDirection}
                setSortDirection={setGpoSortDirection}
                currentPage={gpoCurrentPage}
                setCurrentPage={setGpoCurrentPage}
                pageSize={gpoPageSize}
                setPageSize={setGpoPageSize}
                selectedGPO={selectedGPO}
                setSelectedGPO={setSelectedGPO}
                selectedIndex={selectedGPOIndex}
                setSelectedIndex={setSelectedGPOIndex}
                showRightPanel={showGPORightPanel}
                setShowRightPanel={setShowGPORightPanel}
                isLeftPanelMinimized={isGPOLeftPanelMinimized}
                setIsLeftPanelMinimized={setIsGPOLeftPanelMinimized}
                leftPanelWidthPx={gpoDetailsLeftPanelWidthPx}
                setLeftPanelWidthPx={setGpoDetailsLeftPanelWidthPx}
                rightPanelWidthPx={gpoDetailsRightPanelWidthPx}
                setRightPanelWidthPx={setGpoDetailsRightPanelWidthPx}
                scrollTop={gpoListScrollTop}
                setScrollTop={setGpoListScrollTop}
              />
            )}
          </>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="App">
      {(allResults.length > 0 || GPOReport) && (
        <header className="header">
          <div className="header-content">
            <div className="header-left">
              <h1>Chimas</h1>
            </div>
            
            <div className="header-right">
              <div className="header-file-info">
                <div className="file-details">
                  <div className="file-name">
                    <i className="fas fa-file-alt file-icon"></i>
                    {loadedFileName}
                  </div>
                  <span className="file-separator">•</span>
                  <span className="file-size">{loadedFileSize}</span>
                  <span className="file-separator">•</span>
                  <span className="file-stats">
                    {GPOReport ? `${stats.total} settings` : `${stats.total} files`}
                  </span>
                </div>
                <div className="file-actions">
                  <button className="action-button clear-button" onClick={handleReset}>
                    <i className="fas fa-times button-icon"></i>
                    Clear
                  </button>
                </div>
                <div className="vertical-separator"></div>
                <div className="theme-toggle-switch" onClick={handleThemeToggle}>
                  <i className="fas fa-moon sun-icon"></i>
                  <i className="fas fa-sun moon-icon"></i>
                </div>
              </div>
            </div>
          </div>
        </header>
      )}
      
      <input
        id="file-input"
        type="file"
        accept=".json,.txt,.log"
        onChange={(e) => {
          const files = e.target.files;
          if (files && files.length > 0) {
            processFile(files[0]);
          }
        }}
        style={{ display: 'none' }}
      />

      {errorInfo ? (
        <ErrorDisplay 
          errorMessage={errorInfo.message}
          fileSnippet={errorInfo.snippet}
          errorPosition={errorInfo.errorPosition}
          fileName={errorInfo.fileName}
          fileType={errorInfo.fileType}
          actualLineNumber={errorInfo.actualLineNumber}
          snippetStartLine={errorInfo.snippetStartLine}
          onClearError={handleClearError}
        />
      ) : (allResults.length === 0 && !GPOReport) ? (
        <div className="landing-page">
          <div className="landing-content">
            <FileUpload 
              onFileUpload={handleFileUpload} 
              onReset={handleReset}
              loadedFileName={loadedFileName}
              onThemeToggle={handleThemeToggle}
              isDarkTheme={isDarkTheme}
              onProcessFile={processFile}
            />
          </div>
        </div>
      ) : (
        <>
          <Navigation 
            currentView={currentView}
            onViewChange={setCurrentView}
            hasShareData={allResults.length > 0}
            hasGPOData={!!GPOReport}
          />
          {renderCurrentView()}
        </>
      )}
    </div>
  );
}

export default App; 