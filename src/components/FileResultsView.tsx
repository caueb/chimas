import React, { useRef, useEffect } from 'react';
import { FileResult, Stats, SortField, SortDirection, CustomFilter } from '../types';
import { ResultsTable } from './ResultsTable';
import { DetailPanel } from './DetailPanel';
import { Filters } from './Filters';
import { usePanelLayout, Button, Input } from './shared';

interface VisibleColumns {
  rating: boolean;
  risk: boolean;
  fullPath: boolean;
  creationTime: boolean;
  lastModified: boolean;
  size: boolean;
}

interface FilterState {
  ratingFilter: string[];
  searchFilter: string;
  fileExtensionFilter: string[];
  credentialsFilter: boolean;
  scriptsConfigsFilter: boolean;
  customFilters: CustomFilter[];
  sortField: SortField;
  sortDirection: SortDirection;
}

interface FileResultsViewProps {
  // Data
  allResults: FileResult[];
  filteredResults: FileResult[];
  selectedResult: FileResult | null;
  currentPageData: FileResult[];
  stats: Stats;

  // UI state
  visibleColumns: VisibleColumns;
  setVisibleColumns: React.Dispatch<React.SetStateAction<VisibleColumns>>;
  falsePositives: Set<string>;
  showExportDropdown: boolean;
  setShowExportDropdown: (show: boolean) => void;

  // Filter state
  filters: FilterState;
  setRatingFilter: (ratings: string[]) => void;
  setSearchFilter: (search: string) => void;
  setFileExtensionFilter: (extensions: string[]) => void;
  setCredentialsFilter: (enabled: boolean) => void;
  setScriptsConfigsFilter: (enabled: boolean) => void;
  setCustomFilters: (filters: CustomFilter[] | ((prev: CustomFilter[]) => CustomFilter[])) => void;
  setSortField: (field: SortField) => void;
  setSortDirection: (direction: SortDirection) => void;
  handleSort: (field: SortField) => void;

  // Pagination
  currentPage: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;

  // Actions
  onSelectResult: (result: FileResult) => void;
  onCloseRightPanel: () => void;
  onExportCSV: () => Promise<void>;
  onExportXLSX: () => Promise<void>;
  onToggleFalsePositive: (result: FileResult) => void;

  // Scroll state
  scrollTop: number;
  setScrollTop: (scrollTop: number) => void;
}

export const FileResultsView: React.FC<FileResultsViewProps> = ({
  allResults,
  filteredResults,
  selectedResult,
  currentPageData,
  stats,
  visibleColumns,
  setVisibleColumns,
  falsePositives,
  showExportDropdown,
  setShowExportDropdown,
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
  currentPage,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
  onSelectResult,
  onCloseRightPanel,
  onExportCSV,
  onExportXLSX,
  onToggleFalsePositive,
  scrollTop,
  setScrollTop,
}) => {
  // Panel layout using shared hook
  const [panelState, panelActions] = usePanelLayout({ storageKeyPrefix: 'layout' });
  const { leftPanelWidthPx, rightPanelWidthPx, isLeftPanelMinimized, showRightPanel, draggingSide } = panelState;
  const { setShowRightPanel, toggleLeftPanel, startDragging } = panelActions;

  // Refs
  const filtersPanelRef = useRef<HTMLDivElement>(null);
  const leftResizerRef = useRef<HTMLDivElement>(null);
  const rightResizerRef = useRef<HTMLDivElement>(null);
  const fileTableWrapperRef = useRef<HTMLDivElement>(null);

  // Restore scroll position when component mounts
  useEffect(() => {
    if (fileTableWrapperRef.current && scrollTop > 0) {
      // Use setTimeout to ensure DOM is ready
      setTimeout(() => {
        if (fileTableWrapperRef.current) {
          fileTableWrapperRef.current.scrollTop = scrollTop;
        }
      }, 0);
    }
  }, []); // Only on mount

  // Handle row selection - show right panel
  const handleSelectResult = (result: FileResult) => {
    onSelectResult(result);
    setShowRightPanel(true);
  };

  // Handle closing the right panel
  const handleCloseRightPanel = () => {
    setShowRightPanel(false);
    onCloseRightPanel();
  };

  return (
    <div className="main-content">
      <div
        className={`left-panel ${isLeftPanelMinimized ? 'minimized' : ''}`}
        ref={filtersPanelRef}
        style={{ width: isLeftPanelMinimized ? 50 : leftPanelWidthPx }}
      >
        <div className="panel-header">
          <span>Filters</span>
          <Button variant="ghost" className="minimize-button" onClick={toggleLeftPanel}>
            <i className={`fas fa-chevron-${isLeftPanelMinimized ? 'right' : 'left'}`}></i>
          </Button>
        </div>
        <div className="panel-content">
          <Filters
            ratingFilter={filters.ratingFilter}
            searchFilter={filters.searchFilter}
            fileExtensionFilter={filters.fileExtensionFilter}
            sortField={filters.sortField}
            sortDirection={filters.sortDirection}
            customFilters={filters.customFilters}
            credentialsFilter={filters.credentialsFilter}
            scriptsConfigsFilter={filters.scriptsConfigsFilter}
            onRatingFilterChange={setRatingFilter}
            onSearchFilterChange={setSearchFilter}
            onFileExtensionFilterChange={setFileExtensionFilter}
            onSortFieldChange={setSortField}
            onSortDirectionChange={setSortDirection}
            onCustomFiltersChange={setCustomFilters}
            onCredentialsFilterChange={setCredentialsFilter}
            onScriptsConfigsFilterChange={setScriptsConfigsFilter}
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
              <Input
                id="search-filter"
                value={filters.searchFilter}
                onChange={setSearchFilter}
                placeholder="Search files, paths, or content..."
                clearable
              />
              <div className="table-controls">
                <div id="column-dropdown-container" className="column-visibility-dropdown">
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
                          checked={visibleColumns.risk}
                          onChange={(e) => setVisibleColumns(prev => ({
                            ...prev,
                            risk: e.target.checked
                          }))}
                        />
                        Risk
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
                          await onExportCSV();
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
                          await onExportXLSX();
                          setShowExportDropdown(false);
                        }}
                      >
                        <i className="fas fa-file-excel"></i>
                        Export XLSX
                      </button>
                    </div>
                  )}
                </div>
                <div className={`results-count ${filteredResults.length !== allResults.length ? 'filters-active' : ''}`}>
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
          <div
            className="table-wrapper"
            ref={fileTableWrapperRef}
            onScroll={(e) => {
              const target = e.currentTarget as HTMLDivElement;
              setScrollTop(target.scrollTop);
            }}
          >
            <ResultsTable
              results={currentPageData}
              selectedResult={selectedResult}
              onSelectResult={handleSelectResult}
              sortField={filters.sortField}
              sortDirection={filters.sortDirection}
              onSort={handleSort}
              visibleColumns={visibleColumns}
              currentPage={currentPage}
              pageSize={pageSize}
              totalPages={totalPages}
              totalResults={filteredResults.length}
              onPageChange={onPageChange}
              onPageSizeChange={onPageSizeChange}
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
          <Button variant="ghost" className="close-button" onClick={handleCloseRightPanel} aria-label="Close details panel">
            ×
          </Button>
        </div>
        <div className="panel-content">
          <DetailPanel
            selectedResult={selectedResult}
            onClose={handleCloseRightPanel}
            onToggleFalsePositive={onToggleFalsePositive}
            falsePositives={falsePositives}
          />
        </div>
      </div>

      {/* Resizers */}
      <div
        ref={leftResizerRef}
        className={`resizer resizer-left ${isLeftPanelMinimized ? 'hidden' : ''} ${draggingSide === 'left' ? 'dragging' : ''}`}
        style={{ left: isLeftPanelMinimized ? 50 : leftPanelWidthPx }}
        onMouseDown={(e) => { e.preventDefault(); startDragging('left'); }}
      />
      <div
        ref={rightResizerRef}
        className={`resizer resizer-right ${showRightPanel ? '' : 'hidden'} ${draggingSide === 'right' ? 'dragging' : ''}`}
        style={{ right: rightPanelWidthPx }}
        onMouseDown={(e) => { e.preventDefault(); startDragging('right'); }}
      />
    </div>
  );
};
