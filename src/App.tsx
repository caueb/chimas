import React, { useState, useEffect, useMemo, useRef } from 'react';
import { FileResult, SortField, SortDirection, CustomFilter } from './types';
import { FileUpload } from './components/FileUpload';
import { ResultsTable } from './components/ResultsTable';
import { DetailPanel } from './components/DetailPanel';
import { Filters } from './components/Filters';
import { Navigation } from './components/Navigation';
import { Dashboard } from './components/Dashboard';
import { ShareResults } from './components/ShareResults';
import { ErrorDisplay } from './components/ErrorDisplay';
import { parseSnafflerData, parseShareData } from './utils/parser';
import { format } from 'date-fns';

type View = 'dashboard' | 'file-results' | 'share-results';

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
  
  // Duplicate statistics state
  const [duplicateStats, setDuplicateStats] = useState<any>(null);

  // Error state
  const [errorInfo, setErrorInfo] = useState<{ message: string; snippet?: string; errorPosition?: number; fileName?: string; fileType?: string; actualLineNumber?: number; snippetStartLine?: number } | null>(null);

  // Refs
  const filtersPanelRef = useRef<HTMLDivElement>(null);
  const prevCustomFiltersRef = useRef<CustomFilter[]>([]);

  const handleFileUpload = (data: any, fileType: 'json' | 'text' | 'log', fileName: string, fileSize?: string) => {
    const parseResult = parseSnafflerData(data, fileType);
    const results = parseResult.results;
    const duplicateStats = parseResult.duplicateStats;
    
    setAllResults(results);
    setLoadedFileName(fileName);
    setLoadedFileSize(fileSize || '');
    setCurrentView('dashboard'); // Switch to dashboard after file upload
    
    // Log duplicate statistics if any duplicates were found
    if (duplicateStats && duplicateStats.duplicatesRemoved > 0) {
      console.log(`Duplicate detection: ${duplicateStats.duplicatesRemoved} duplicates removed (${duplicateStats.duplicatePercentage}% of total)`);
      setDuplicateStats(duplicateStats);
    } else {
      setDuplicateStats(null);
    }
    
    // Calculate stats
    const newStats = {
      total: results.length,
      red: results.filter((r: FileResult) => r.rating.toLowerCase() === 'red').length,
      yellow: results.filter((r: FileResult) => r.rating.toLowerCase() === 'yellow').length,
      green: results.filter((r: FileResult) => r.rating.toLowerCase() === 'green').length,
      black: results.filter((r: FileResult) => r.rating.toLowerCase() === 'black').length
    };
    setStats(newStats);
    
    // Parse share data for Share Results section
    const shares = parseShareData(data, fileType);
    setShareResults(shares);
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
    setDuplicateStats(null);
    setErrorInfo(null);
    
    // Reset all filters and search
    setRatingFilter(['all']);
    setSearchFilter('');
    setFileExtensionFilter([]);
    setCustomFilters([]);
    setCredentialsFilter(false);
    
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

  // Handle click outside to close column dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const dropdown = document.getElementById('column-dropdown');
      if (dropdown && !dropdown.contains(event.target as Node)) {
        dropdown.classList.remove('show');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleToggleLeftPanel = () => {
    setIsLeftPanelMinimized(!isLeftPanelMinimized);
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

  // CSV Export function
  const exportToCSV = () => {
    if (filteredResults.length === 0) return;

    // Create CSV headers based on visible columns
    const headers: string[] = [];
    if (visibleColumns.rating) headers.push('Rating');
    if (visibleColumns.fullPath) headers.push('Full Path');
    if (visibleColumns.creationTime) headers.push('Creation Time');
    if (visibleColumns.lastModified) headers.push('Last Modified');
    if (visibleColumns.size) headers.push('Size');

    // Helper function to format date
    const formatDate = (dateString: string) => {
      try {
        return format(new Date(dateString), 'dd/MM/yyyy HH:mm:ss');
      } catch {
        return dateString;
      }
    };

    // Helper function to format file size
    const formatFileSize = (size: string) => {
      const sizeNum = parseInt(size);
      if (isNaN(sizeNum)) return size;
      
      if (sizeNum < 1024) return `${sizeNum} B`;
      if (sizeNum < 1024 * 1024) return `${(sizeNum / 1024).toFixed(1)} KB`;
      if (sizeNum < 1024 * 1024 * 1024) return `${(sizeNum / (1024 * 1024)).toFixed(1)} MB`;
      return `${(sizeNum / (1024 * 1024 * 1024)).toFixed(1)} GB`;
    };

    // Create CSV content
    const csvContent = [
      headers.join(','),
      ...filteredResults.map(result => {
        const row: string[] = [];
        if (visibleColumns.rating) row.push(`"${result.rating}"`);
        if (visibleColumns.fullPath) row.push(`"${result.fullPath.replace(/"/g, '""')}"`);
        if (visibleColumns.creationTime) row.push(`"${formatDate(result.creationTime)}"`);
        if (visibleColumns.lastModified) row.push(`"${formatDate(result.lastModified)}"`);
        if (visibleColumns.size) row.push(`"${formatFileSize(result.size)}"`);
        return row.join(',');
      })
    ].join('\n');

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `snaffler-results-${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
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
          </div>
        );
      
      case 'file-results':
        return (
          <div className="main-content">
            <div className={`left-panel ${isLeftPanelMinimized ? 'minimized' : ''}`} ref={filtersPanelRef}>
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

            <div className={`center-panel ${isLeftPanelMinimized ? 'expanded' : ''} ${showRightPanel ? 'with-right-panel' : ''}`}>
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
                      <button 
                        className="action-button"
                        onClick={exportToCSV}
                        disabled={filteredResults.length === 0}
                        title="Export current results to CSV"
                      >
                        <i className="fas fa-download button-icon"></i>
                        Export CSV
                      </button>
                      <div className="results-count">
                        Showing {filteredResults.length} of {allResults.length} files
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
                  />
                </div>
              </div>
            </div>

            <div className={`right-panel ${!showRightPanel ? 'hidden' : ''}`}>
              <div className="panel-header">
                <span>Details</span>
                <button className="close-button" onClick={handleCloseRightPanel}>
                  ×
                </button>
              </div>
              <div className="panel-content">
                <DetailPanel selectedResult={selectedResult} onClose={handleCloseRightPanel} />
              </div>
            </div>
          </div>
        );
      
      case 'share-results':
        return (
          <div className="share-results-container">
            <ShareResults shareResults={shareResults} />
          </div>
        );
      
      default:
        return null;
    }
  };

  return (
    <div className="App">
      {allResults.length > 0 && (
        <header className="header">
          <div className="header-content">
            <div className="header-left">
              <h1>🧉 Chimas</h1>
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
                  <span className="file-stats">{stats.total} files</span>
                  {duplicateStats && duplicateStats.duplicatesRemoved > 0 && (
                    <>
                      <span className="file-separator">•</span>
                      <span className="file-stats duplicate-warning">
                        {duplicateStats.duplicatesRemoved} duplicates removed
                      </span>
                    </>
                  )}
                </div>
                <div className="file-actions">
                  <button className="action-button clear-button" onClick={handleReset}>
                    <i className="fas fa-times button-icon"></i>
                    Clear
                  </button>
                </div>
                <div className="vertical-separator"></div>
                <button className="action-button theme-toggle-button" onClick={handleThemeToggle}>
                  <i className={`fas fa-${isDarkTheme ? 'sun' : 'moon'} button-icon`}></i>
                  {isDarkTheme ? 'Light' : 'Dark'}
                </button>
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
            const file = files[0];
            const fileType = file.name.endsWith('.json') ? 'json' : (file.name.endsWith('.log') ? 'log' : 'text');
            const fileSize = formatFileSize(file.size);
            file.text().then(text => {
              try {
                setErrorInfo(null); // Clear previous errors
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
                
                // For JSON files, we know this is a JSON parsing error
                if (fileType === 'json') {
                  // Try different patterns for error position (check line/column first!)
                  let match = null;
                  
                  // First check for "line X column Y" format
                  const lineColumnMatch = error.message.match(/line (\d+) column (\d+)/);
                                        if (lineColumnMatch) {
                        const lineNum = parseInt(lineColumnMatch[1], 10);
                        const colNum = parseInt(lineColumnMatch[2], 10);
                        
                        // Calculate approximate position by finding the line
                        const lines = text.split('\n');
                        let position = 0;
                        const targetLine = Math.min(lineNum - 1, lines.length - 1); // Ensure we don't go beyond file
                        
                        for (let i = 0; i < targetLine; i++) {
                          position += lines[i].length + 1; // +1 for newline
                        }
                        position += colNum - 1; // Add column offset (0-based)
                        
                        match = [null, position.toString()]; // Fake match array for consistency
                      }
                    
                  // Then try other position patterns
                  if (!match) {
                    match = error.message.match(/position (\d+)/);
                  }
                  if (!match) {
                    match = error.message.match(/at position (\d+)/);
                  }
                  if (!match) {
                    match = error.message.match(/column (\d+)/);
                  }
                  
                  if (match) {
                    const absolutePosition = parseInt(match[1], 10);
                    
                    // For line/column errors, show more context lines
                    let start, end, actualErrorLine, snippetStartLine;
                    if (lineColumnMatch) {
                      // Show ±2 lines around the error for compact view
                      const lineNum = parseInt(lineColumnMatch[1], 10);
                      const lines = text.split('\n');
                      const startLine = Math.max(0, lineNum - 3); // 2 lines before + current line
                      const endLine = Math.min(lines.length, lineNum + 2); // 2 lines after
                      
                      // Calculate character positions for these lines
                      start = 0;
                      for (let i = 0; i < startLine; i++) {
                        start += lines[i].length + 1; // +1 for newline
                      }
                      
                      end = start;
                      for (let i = startLine; i < endLine; i++) {
                        end += lines[i].length + 1; // +1 for newline
                      }
                      end = Math.min(text.length, end);
                      
                      actualErrorLine = lineNum;
                      snippetStartLine = startLine + 1; // Convert to 1-based
                    } else {
                      // Fallback to character-based snippet
                      start = Math.max(0, absolutePosition - 150);
                      end = Math.min(text.length, absolutePosition + 150);
                      actualErrorLine = undefined;
                      snippetStartLine = undefined;
                    }
                    
                    snippet = text.substring(start, end);
                    
                    // Calculate relative position within the snippet
                    let relativePosition = absolutePosition - start;
                    if (start > 0) {
                      snippet = '...' + snippet;
                      relativePosition += 3; // Account for the '...' prefix
                    }
                    if (end < text.length) {
                      snippet = snippet + '...';
                    }
                    
                    errorPosition = relativePosition;
                    
                    // Store line info for error display
                    tempErrorLineInfo = { actualErrorLine, snippetStartLine };
                  } else {
                    // For errors without position, check if it's an end-of-file error
                    const errorMsg = error.message.toLowerCase();
                    
                    if (errorMsg.includes('unexpected end') || 
                        errorMsg.includes('unterminated') ||
                        errorMsg.includes('expected') ||
                        errorMsg.includes('eof') ||
                        errorMsg.includes('end of') ||
                        errorMsg.includes('missing') ||
                        errorMsg.includes('incomplete')) {
                      // Show last 300 characters for end-of-file errors
                      const start = Math.max(0, text.length - 300);
                      snippet = text.substring(start);
                      if (start > 0) snippet = '...' + snippet;
                      errorPosition = text.length - (text.length - start); // Relative position within snippet
                    } else {
                      // Default to beginning for other JSON errors
                      snippet = text.substring(0, 300);
                      if (text.length > 300) snippet = snippet + '...';
                    }
                  }
                } else {
                  // Non-JSON files
                  snippet = text.substring(0, 300);
                  if (text.length > 300) snippet = snippet + '...';
                }

                setErrorInfo({
                  message: error.message || 'An unknown error occurred while processing the file.',
                  snippet: snippet,
                  errorPosition: errorPosition,
                  fileName: file.name,
                  fileType: fileType,
                  actualLineNumber: tempErrorLineInfo?.actualErrorLine,
                  snippetStartLine: tempErrorLineInfo?.snippetStartLine
                });
              }
                            }).catch(error => {
                console.error('Error reading file:', error);
                setErrorInfo({
                  message: 'Error reading file. Please check if the file is corrupted or unreadable.',
                  fileName: file.name,
                  fileType: fileType
                });
              });
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
      ) : allResults.length === 0 ? (
        <div className="landing-page">
          <div className="landing-content">
            <FileUpload 
              onFileUpload={handleFileUpload} 
              onReset={handleReset}
              loadedFileName={loadedFileName}
              onThemeToggle={handleThemeToggle}
              isDarkTheme={isDarkTheme}
            />
          </div>
        </div>
      ) : (
        <>
          <Navigation 
            currentView={currentView}
            onViewChange={setCurrentView}
            hasData={allResults.length > 0}
          />
          {renderCurrentView()}
        </>
      )}
    </div>
  );
}

export default App; 