import React, { useState, useEffect, useMemo } from 'react';
import { FileResult, SortField, SortDirection, CustomFilter, ShareInfo, GPOReport } from './types';
import { FileUpload } from './components/FileUpload';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { GPODashboard } from './components/GPODashboard';
import { ShareResults } from './components/ShareResults';
import { ErrorDisplay } from './components/ErrorDisplay';
import { KeyboardShortcutsModal } from './components/KeyboardShortcutsModal';
import { processUploadedFile, applyInChunks, type UploadedFileType } from './utils/fileProcessor';
import { BloodHoundModal } from './components/BloodHoundModal';
import GPOResults from './components/GPOResults.tsx';
import GPODetails from './components/GPODetails.tsx';
import { FileResultsView } from './components/FileResultsView';
import { Misconfigurations } from './components/Misconfigurations';
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
import { View } from './utils/constants';

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
    bloodHoundData, setBloodHoundData, isBloodHoundLoaded, bloodHoundFileCount,
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
    setCustomFilters,
    setPlaybookFilesFilter,
    clearPlaybookFilesFilter,
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
    risk: false,
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
  const [processingStatus, setProcessingStatus] = useState('Processing file...');

  // BloodHound modal state
  const [showBHModal, setShowBHModal] = useState(false);

  const applyGpoReport = (report: GPOReport, fileName: string, fileSize?: string) => {
    setGPOReport(report);
    setLoadedFileName(fileName);
    setLoadedFileSize(fileSize || '');
    setAllResults([]);
    setShareResults([]);
    const totalSettings = report.gpos.reduce((total, gpo) => total + gpo.settings.length, 0);
    setStats({
      total: totalSettings,
      red: 0,
      yellow: 0,
      green: 0,
      black: 0,
    });
    setDuplicateStats(null);
    setCurrentView('dashboard');
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
      risk: false,
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

  const snippetFromHead = (head: string, max = 300): string => {
    if (head.length <= max) return head;
    return head.slice(0, max) + '...';
  };

  const processFile = async (file: File) => {
    const fileType: UploadedFileType = file.name.endsWith('.json')
      ? 'json'
      : (file.name.endsWith('.log') ? 'log' : 'text');
    const fileSize = formatFileSize(file.size);
    setIsProcessing(true);
    setProcessingStatus('Reading file…');
    setErrorInfo(null);

    try {
      const processed = await processUploadedFile(file, {
        gpoAlreadyLoaded: !!GPOReport,
        onProgress: setProcessingStatus,
      });

      if (processed.kind === 'bloodhound') {
        setShowBHModal(true);
        return;
      }

      if (processed.kind === 'gpo') {
        applyGpoReport(processed.report, file.name, fileSize);
        return;
      }

      const { results, shares, duplicateStats } = processed.output;

      setProcessingStatus(
        results.length > 5000
          ? `Scoring ${results.length.toLocaleString()} findings…`
          : 'Scoring findings…'
      );
      const resultsWithRiskScores = await applyInChunks(
        results,
        (result) => ({ ...result, riskScore: calculateRiskScore(result) }),
        2500,
        (done, total) => {
          setProcessingStatus(`Scoring findings… ${done.toLocaleString()} / ${total.toLocaleString()}`);
        }
      );

      const newStats = {
        total: resultsWithRiskScores.length,
        red: 0,
        yellow: 0,
        green: 0,
        black: 0,
      };
      for (const r of resultsWithRiskScores) {
        const rating = r.rating.toLowerCase();
        if (rating === 'red') newStats.red++;
        else if (rating === 'yellow') newStats.yellow++;
        else if (rating === 'green') newStats.green++;
        else if (rating === 'black') newStats.black++;
      }

      setAllResults(resultsWithRiskScores);
      setShareResults(shares);
      setLoadedFileName(file.name);
      setLoadedFileSize(fileSize || '');
      setCurrentView('dashboard');
      setGPOReport(null);
      setDuplicateStats(
        duplicateStats && duplicateStats.duplicatesRemoved > 0 ? duplicateStats : null
      );
      setStats(newStats);
    } catch (error: unknown) {
      console.error('Error processing file:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      // Never split a multi-hundred-MB buffer just to build an error snippet.
      let snippet = '';
      try {
        const head = await file.slice(0, 4096).text();
        snippet = snippetFromHead(head);
      } catch {
        snippet = '';
      }

      setErrorInfo({
        message: errorMessage || 'An unknown error occurred while processing the file.',
        snippet,
        fileName: file.name,
        fileType,
      });
    } finally {
      setIsProcessing(false);
      setProcessingStatus('Processing file...');
    }
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

  const handleNavigateToShares = () => {
    setCurrentView('share-results');
  };

  const handleFilterBySystem = (systemId: string) => {
    setSearchFilter(systemId);
    setRatingFilter(['all']); // Reset rating filter
    setCustomFilters([]); // Reset custom filters
    clearPlaybookFilesFilter();
  };

  const handleFilterByShare = (sharePath: string) => {
    setSearchFilter(sharePath);
    setRatingFilter(['all']); // Reset rating filter
    setCustomFilters([]); // Reset custom filters
    clearPlaybookFilesFilter();
  };

  const handleFilterByExtension = (extension: string | string[]) => {
    const extensions = (Array.isArray(extension) ? extension : [extension]).map((value) =>
      value.replace(/^\./, '').toLowerCase()
    );
    setFileExtensionFilter(extensions);
    setSearchFilter(''); // Clear search filter
    setRatingFilter(['all']); // Reset rating filter
    setCustomFilters([]); // Reset custom filters
    clearPlaybookFilesFilter();
  };

  const handleFilterBySearch = (search: string) => {
    setSearchFilter(search);
    setFileExtensionFilter([]);
    setRatingFilter(['all']);
    setCustomFilters([]);
    clearPlaybookFilesFilter();
  };

  const handleFilterByPlaybookFiles = (paths: string[], label: string) => {
    setPlaybookFilesFilter(paths, label);
  };

  const handleSelectFile = (file: FileResult) => {
    setSelectedResult(file);
    setShowRightPanel(true);
    // Also filter to show only this file
    setSearchFilter(file.fileName);
    setRatingFilter(['all']); // Reset rating filter
    setCustomFilters([]); // Reset custom filters
    clearPlaybookFilesFilter();
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
              <GPODashboard
                report={GPOReport}
                bloodHoundData={bloodHoundData}
                onLoadBloodHound={() => setShowBHModal(true)}
              />
            ) : (
              <Dashboard
                stats={stats}
                allResults={allResults}
                shareResults={shareResults}
                onNavigateToResults={handleNavigateToResults}
                onNavigateToShares={handleNavigateToShares}
                onFilterBySystem={handleFilterBySystem}
                onFilterByShare={handleFilterByShare}
                onFilterByExtension={handleFilterByExtension}
                onFilterByPlaybookFiles={handleFilterByPlaybookFiles}
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
            setCustomFilters={setCustomFilters}
            clearPlaybookFilesFilter={clearPlaybookFilesFilter}
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
                bloodHoundData={bloodHoundData}
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

      case 'security-baseline':
      case 'misconfigurations':
        return (
          <>
            {GPOReport && (
              <Misconfigurations report={GPOReport} bloodHoundData={bloodHoundData} />
            )}
          </>
        );

      default:
        return null;
    }
  };

  const hasLoadedData = allResults.length > 0 || !!GPOReport;

  return (
    <div className="App">
      {hasLoadedData && (
        <>
          <nav className="nav header">
            <div className="brand nav-brand">
              <div className="brand-mark">cm</div>
              <div className="brand-name">chi<span>mas</span></div>
            </div>

            <div className="nav-right">
              <div className="nav-meta">
                <span
                  className="nav-data-chip loaded"
                  title={
                    loadedFileName
                      ? `${loadedFileName}${loadedFileSize ? ` (${loadedFileSize})` : ''}`
                      : GPOReport
                        ? 'Group3r data loaded'
                        : 'Snaffler data loaded'
                  }
                >
                  <i
                    className={`fas ${GPOReport ? 'fa-sitemap' : 'fa-folder-open'}`}
                    aria-hidden="true"
                  ></i>
                  <span className="nav-data-type">{GPOReport ? 'Group3r' : 'Snaffler'}</span>
                </span>

                {GPOReport && (
                  <button
                    className={`nav-data-chip ${isBloodHoundLoaded ? 'loaded' : 'pending'}`}
                    onClick={() => setShowBHModal(true)}
                    title={
                      isBloodHoundLoaded
                        ? `BloodHound loaded (${bloodHoundFileCount}/7 types) — click to manage`
                        : 'Load BloodHound data'
                    }
                    type="button"
                  >
                    <i className="fas fa-project-diagram" aria-hidden="true"></i>
                    <span className="nav-data-type">BloodHound</span>
                  </button>
                )}
              </div>

              <div className="nav-actions">
                <button
                  className="action-button clear-button btn btn-sm"
                  onClick={handleReset}
                  title="Clear all loaded data"
                  type="button"
                >
                  <i className="fas fa-times button-icon"></i>
                  Clear
                </button>
              </div>
            </div>
          </nav>

          <Navigation
            currentView={currentView}
            onViewChange={setCurrentView}
            hasShareData={allResults.length > 0}
            hasGPOData={!!GPOReport}
            hasBloodHoundData={isBloodHoundLoaded}
            counts={{
              files: allResults.length,
              filteredFiles: filteredResults.length,
              shares: shareResults.length,
              gpoSettings: GPOReport?.gpos.reduce((total, gpo) => total + gpo.settings.length, 0) || 0,
              gpoCount: GPOReport?.gpos.length || 0
            }}
          />
        </>
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
      ) : !hasLoadedData ? (
        <div className="landing-page">
          <div className="landing-content">
            <FileUpload
              onThemeToggle={handleThemeToggle}
              onProcessFile={processFile}
            />
          </div>
        </div>
      ) : (
        <>{renderCurrentView()}</>
      )}

      {/* Keyboard Shortcuts Modal */}
      <KeyboardShortcutsModal
        isOpen={showKeyboardShortcuts}
        onClose={() => setShowKeyboardShortcuts(false)}
      />

      {/* Loading Spinner Overlay */}
      {isProcessing && (
        <div className="spinner-overlay">
          <Spinner size="large" label={processingStatus} />
        </div>
      )}

      {/* BloodHound Modal */}
      {showBHModal && (
        <BloodHoundModal
          bloodHoundData={bloodHoundData}
          onDataLoaded={(data) => setBloodHoundData(data)}
          onClose={() => setShowBHModal(false)}
        />
      )}

      {/* Toast Notifications */}
      <Toast />
    </div>
  );
}

export default App; 
