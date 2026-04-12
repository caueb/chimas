import React, { useState, useEffect, useMemo } from 'react';
import { FileResult, SortField, SortDirection, CustomFilter, SnafflerJsonData, ShareInfo } from './types';
import { FileUpload } from './components/FileUpload';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { GPODashboard } from './components/GPODashboard';
import { ShareResults } from './components/ShareResults';
import { ErrorDisplay } from './components/ErrorDisplay';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { parseSnafflerData, parseShareData } from './utils/parser';
import { parseGPO } from './utils/GPOParser';
import GPOResults from './components/GPOResults.tsx';
import GPODetails from './components/GPODetails.tsx';
import { FileResultsView } from './components/FileResultsView';
import {
  exportFileResultsToCSV,
  exportFileResultsToXLSX,
  exportShareResultsToCSV,
  exportShareResultsToXLSX,
  exportGPOToCSV,
  exportGPOToXLSX,
} from './utils/exporter';
import { calculateRiskScore } from './utils/riskScoring';
import { usePanelLayout, Spinner, Toast, showToast } from './components/shared';
import { useFileResultsState, useGPOState, useFiltering } from './hooks';

type View = 'dashboard' | 'file-results' | 'share-results' | 'GPO-results' | 'GPO-details';

function App() {
  // File Results state from custom hook
  const fileResultsState = useFileResultsState();
  const {
    allResults, setAllResults,
    selectedResult, setSelectedResult,
    stats, setStats,
    loadedFileName, setLoadedFileName,
    loadedFileSize, setLoadedFileSize,
    duplicateStats, setDuplicateStats,
    errorInfo, setErrorInfo,
    falsePositives, setFalsePositives, toggleFalsePositive,
    showExportDropdown, setShowExportDropdown,
    fileResultsScrollTop, setFileResultsScrollTop,
    clearResults,
  } = fileResultsState;

  // GPO state from custom hook
  const gpoState = useGPOState();
  const {
    GPOReport, setGPOReport,
    gpoList,
    setGpoSearch, setGpoLinkedFilter, setGpoSortField, setGpoSortDirection,
    setGpoCurrentPage, setGpoPageSize, setSelectedGPO, setSelectedGPOIndex,
    setGpoListScrollTop,
    gpoSettings,
    setGpoSettingsSearch, setGpoSettingsScopeFilter, setGpoSettingsCategoryFilter,
    setGpoSettingsCurrentPage, setGpoSettingsPageSize, setGpoSettingsSortField,
    setGpoSettingsSortDirection, setGpoSettingsSelectedIndex,
    setGpoSettingsShowExportDropdown, setGpoSettingsScrollTop,
    clearGPOState,
  } = gpoState;

  // Filtering and sorting from custom hook
  const {
    filteredResults,
    filters,
    setRatingFilter,
    setSearchFilter,
    setFileExtensionFilter,
    setCredentialsFilter,
    setScriptsConfigsFilter,
    setCustomFilters,
    setSortField,
    setSortDirection,
    handleSort,
    resetFilters,
  } = useFiltering({ data: allResults });

  const [currentView, setCurrentView] = useState<View>('dashboard');

  // Panel layout using shared hook (replaces inline panel sizing logic)
  const [panelState, panelActions] = usePanelLayout({ storageKeyPrefix: 'layout' });
  const { leftPanelWidthPx, rightPanelWidthPx, isLeftPanelMinimized, showRightPanel, draggingSide } = panelState;
  const { setShowRightPanel, toggleLeftPanel, startDragging } = panelActions;

  // Theme state
  const [isDarkTheme, setIsDarkTheme] = useState(true);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState({
    rating: true,
    risk: true,
    fullPath: true,
    creationTime: true,
    lastModified: true,
    size: true
  });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);

  // Share Results state
  const [shareResults, setShareResults] = useState<ShareInfo[]>([]);

  // Keyboard shortcuts modal state
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false);

  // Loading state for file processing
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileUpload = (data: SnafflerJsonData | string | string[], fileType: 'json' | 'text' | 'log', fileName: string, fileSize?: string) => {
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

      // Calculate risk scores for all results
      const resultsWithRiskScores = results.map(result => ({
        ...result,
        riskScore: calculateRiskScore(result)
      }));

      setAllResults(resultsWithRiskScores);
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
        total: resultsWithRiskScores.length,
        red: resultsWithRiskScores.filter((r: FileResult) => r.rating.toLowerCase() === 'red').length,
        yellow: resultsWithRiskScores.filter((r: FileResult) => r.rating.toLowerCase() === 'yellow').length,
        green: resultsWithRiskScores.filter((r: FileResult) => r.rating.toLowerCase() === 'green').length,
        black: resultsWithRiskScores.filter((r: FileResult) => r.rating.toLowerCase() === 'black').length
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
    // Clear File Results state using hook action
    clearResults();
    setShowRightPanel(false);
    setCurrentView('dashboard');

    // Clear GPO state using hook action
    clearGPOState();

    // Clear Share Results
    setShareResults([]);

    // Clear localStorage
    try {
      localStorage.clear();
    } catch (error) {
      console.warn('Failed to clear localStorage:', error);
    }

    // Reset all filters using hook
    resetFilters();

    // Reset pagination
    setCurrentPage(1);
    setPageSize(100);

    // Reset column visibility
    setVisibleColumns({
      rating: true,
      risk: true,
      fullPath: true,
      creationTime: true,
      lastModified: true,
      size: true
    });

    // Reset panel state (restore left panel if minimized)
    if (isLeftPanelMinimized) {
      toggleLeftPanel();
    }

    // Clear the file input so the same file can be selected again
    const fileInput = document.getElementById('file-input') as HTMLInputElement;
    if (fileInput) {
      fileInput.value = '';
    }
  };

  const handleClearError = () => {
    handleReset();
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
    setIsProcessing(true);
    file.text().then(text => {
      try {
        setErrorInfo(null);
        if (fileType === 'json') {
          const jsonData = JSON.parse(text);
          handleFileUpload(jsonData, 'json', file.name, fileSize);
        } else {
          handleFileUpload([text], fileType, file.name, fileSize);
        }
      } catch (error: unknown) {
        console.error('Error processing file:', error);
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        let snippet = '';
        let errorPosition: number | undefined;
        let tempErrorLineInfo: { actualErrorLine?: number; snippetStartLine?: number } = {};

        if (fileType === 'json') {
          let match: RegExpMatchArray | null = null;
          const lineColumnMatch = errorMessage.match(/line (\d+) column (\d+)/);
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
            match = ['', position.toString()] as RegExpMatchArray;
          }
          if (!match) match = errorMessage.match(/position (\d+)/);
          if (!match) match = errorMessage.match(/at position (\d+)/);
          if (!match) match = errorMessage.match(/column (\d+)/);

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
            snippet = text.substring(start, end);
            let relativePosition = absolutePosition - start;
            if (start > 0) { snippet = '...' + snippet; relativePosition += 3; }
            if (end < text.length) { snippet = snippet + '...'; }
            errorPosition = relativePosition;
            tempErrorLineInfo = { actualErrorLine, snippetStartLine };
          } else {
            const errorMsg = errorMessage.toLowerCase();
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
          message: errorMessage || 'An unknown error occurred while processing the file.',
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
    }).finally(() => {
      setIsProcessing(false);
    });
  };


  // Handle click outside to close column dropdown and export dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const columnDropdownContainer = document.getElementById('column-dropdown-container');
      const columnDropdown = document.getElementById('column-dropdown');
      if (columnDropdownContainer && columnDropdown && !columnDropdownContainer.contains(event.target as Node)) {
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

      // ? key to show keyboard shortcuts (works even when typing)
      if (event.key === '?' && !event.ctrlKey && !event.altKey && !event.metaKey) {
        // Only show if shift is pressed (Shift+/) = ?
        event.preventDefault();
        setShowKeyboardShortcuts(prev => !prev);
        return;
      }

      // Escape to close panels/modals
      if (event.key === 'Escape') {
        if (showKeyboardShortcuts) {
          setShowKeyboardShortcuts(false);
          return;
        }
        if (showRightPanel) {
          handleCloseRightPanel();
          return;
        }
      }

      if (isTyping) return;

      // F key to toggle false positive
      if (event.key.toLowerCase() === 'f' && selectedResult) {
        event.preventDefault();
        handleToggleFalsePositive(selectedResult);
      }

      // / key to focus search input
      if (event.key === '/' && currentView === 'file-results') {
        event.preventDefault();
        const searchInput = document.getElementById('search-filter');
        if (searchInput) {
          searchInput.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedResult, showKeyboardShortcuts, showRightPanel, currentView]);

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

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

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

  // Handle toggling false positive status (uses hook's toggleFalsePositive)
  const handleToggleFalsePositive = (result: FileResult) => {
    const key = `${result.fullPath}-${result.fileName}`;
    toggleFalsePositive(key);
  };

  // Unified export handlers for current view
  const handleExportCSV = async () => {
    if (currentView === 'file-results') {
      exportFileResultsToCSV(filteredResults, visibleColumns, falsePositives);
      showToast('CSV export complete', 'success');
    } else if (currentView === 'share-results') {
      exportShareResultsToCSV(shareResults);
      showToast('CSV export complete', 'success');
    } else if (currentView === 'GPO-results' && GPOReport) {
      exportGPOToCSV(GPOReport);
      showToast('CSV export complete', 'success');
    }
  };

  const handleExportXLSX = async () => {
    if (currentView === 'file-results') {
      await exportFileResultsToXLSX(allResults, filteredResults, visibleColumns, falsePositives, stats, loadedFileName);
      showToast('XLSX export complete', 'success');
    } else if (currentView === 'share-results') {
      await exportShareResultsToXLSX(shareResults);
      showToast('XLSX export complete', 'success');
    } else if (currentView === 'GPO-results' && GPOReport) {
      await exportGPOToXLSX(GPOReport);
      showToast('XLSX export complete', 'success');
    }
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
          <FileResultsView
            allResults={allResults}
            filteredResults={filteredResults}
            selectedResult={selectedResult}
            currentPageData={currentPageData}
            stats={stats}
            visibleColumns={visibleColumns}
            setVisibleColumns={setVisibleColumns}
            falsePositives={falsePositives}
            showExportDropdown={showExportDropdown}
            setShowExportDropdown={setShowExportDropdown}
            filters={filters}
            setRatingFilter={setRatingFilter}
            setSearchFilter={setSearchFilter}
            setFileExtensionFilter={setFileExtensionFilter}
            setCredentialsFilter={setCredentialsFilter}
            setScriptsConfigsFilter={setScriptsConfigsFilter}
            setCustomFilters={setCustomFilters}
            setSortField={setSortField}
            setSortDirection={setSortDirection}
            handleSort={handleSort}
            currentPage={currentPage}
            pageSize={pageSize}
            totalPages={totalPages}
            onPageChange={handlePageChange}
            onPageSizeChange={handlePageSizeChange}
            onSelectResult={setSelectedResult}
            onCloseRightPanel={() => setSelectedResult(null)}
            onExportCSV={handleExportCSV}
            onExportXLSX={handleExportXLSX}
            onToggleFalsePositive={handleToggleFalsePositive}
            scrollTop={fileResultsScrollTop}
            setScrollTop={setFileResultsScrollTop}
          />
        );

      case 'share-results':
        return (
          <ShareResults shareResults={shareResults} />
        );
      case 'GPO-results':
        return (
          <>
            {GPOReport && (
              <GPOResults
                report={GPOReport}
                search={gpoSettings.search}
                setSearch={setGpoSettingsSearch}
                scopeFilter={gpoSettings.scopeFilter}
                setScopeFilter={setGpoSettingsScopeFilter}
                categoryFilter={gpoSettings.categoryFilter}
                setCategoryFilter={setGpoSettingsCategoryFilter}
                currentPage={gpoSettings.currentPage}
                setCurrentPage={setGpoSettingsCurrentPage}
                pageSize={gpoSettings.pageSize}
                setPageSize={setGpoSettingsPageSize}
                sortField={gpoSettings.sortField}
                setSortField={setGpoSettingsSortField}
                sortDirection={gpoSettings.sortDirection}
                setSortDirection={setGpoSettingsSortDirection}
                selectedIndex={gpoSettings.selectedIndex}
                setSelectedIndex={setGpoSettingsSelectedIndex}
                showExportDropdown={gpoSettings.showExportDropdown}
                setShowExportDropdown={setGpoSettingsShowExportDropdown}
                scrollTop={gpoSettings.scrollTop}
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
                search={gpoList.search}
                setSearch={setGpoSearch}
                linkedFilter={gpoList.linkedFilter}
                setLinkedFilter={setGpoLinkedFilter}
                sortField={gpoList.sortField}
                setSortField={setGpoSortField}
                sortDirection={gpoList.sortDirection}
                setSortDirection={setGpoSortDirection}
                currentPage={gpoList.currentPage}
                setCurrentPage={setGpoCurrentPage}
                pageSize={gpoList.pageSize}
                setPageSize={setGpoPageSize}
                selectedGPO={gpoList.selectedGPO}
                setSelectedGPO={setSelectedGPO}
                selectedIndex={gpoList.selectedIndex}
                setSelectedIndex={setSelectedGPOIndex}
                scrollTop={gpoList.scrollTop}
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
            counts={{
              files: allResults.length,
              filteredFiles: filteredResults.length,
              shares: shareResults.length,
              gpoSettings: GPOReport?.gpos.reduce((total, gpo) => total + gpo.settings.length, 0) || 0,
              gpoCount: GPOReport?.gpos.length || 0
            }}
          />
          {renderCurrentView()}
        </>
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
      />

      {/* Loading Spinner Overlay */}
      {isProcessing && (
        <div className="spinner-overlay">
          <Spinner size="large" label="Processing file..." />
        </div>
      )}

      {/* Toast Notifications */}
      <Toast />
    </div>
  );
}

export default App; 
