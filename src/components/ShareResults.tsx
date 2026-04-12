import React, { useState, useMemo, useRef, useEffect } from 'react';
import { extractSystemIdentifier } from '../utils/parser';
import { usePanelLayout, Button, Input } from './shared';
import { ShareFilters } from './ShareFilters';
import { ShareDetailPanel } from './ShareDetailPanel';

interface ShareVisibleColumns {
  path: boolean;
  fileCount: boolean;
  comment: boolean;
  properties: boolean;
}

export interface ShareInfo {
  systemId: string;
  shareName: string;
  permissions: string;
  fileCount: number;
  path: string;
  shareComment: string;
  listable: boolean;
  rootWritable: boolean;
  rootReadable: boolean;
  rootModifyable: boolean;
  snaffle: boolean;
  scanShare: boolean;
  rating: string;
}

interface ShareResultsProps {
  shareResults: ShareInfo[];
}

export const ShareResults: React.FC<ShareResultsProps> = ({ shareResults }) => {
  const [searchFilter, setSearchFilter] = useState('');
  const [sortField, setSortField] = useState<'path' | 'fileCount'>('path');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(100);
  const [selectedShare, setSelectedShare] = useState<ShareInfo | null>(null);

  // Toggle filter states
  const [showWritableOnly, setShowWritableOnly] = useState(false);
  const [showReadableOnly, setShowReadableOnly] = useState(false);
  const [showModifiableOnly, setShowModifiableOnly] = useState(false);

  // Column visibility state
  const [visibleColumns, setVisibleColumns] = useState<ShareVisibleColumns>({
    path: true,
    fileCount: true,
    comment: true,
    properties: true,
  });

  // Panel layout using shared hook
  const [panelState, panelActions] = usePanelLayout({ storageKeyPrefix: 'shareLayout' });
  const { leftPanelWidthPx, rightPanelWidthPx, isLeftPanelMinimized, showRightPanel, draggingSide } = panelState;
  const { setShowRightPanel, toggleLeftPanel, startDragging } = panelActions;

  // Refs
  const filtersPanelRef = useRef<HTMLDivElement>(null);
  const leftResizerRef = useRef<HTMLDivElement>(null);
  const rightResizerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const filteredShares = useMemo(() => {
    return shareResults
    .filter(share => {
      const systemInfo = extractSystemIdentifier(share.systemId);

      // Search filter
      const searchMatch = (
        share.path.toLowerCase().includes(searchFilter.toLowerCase()) ||
        share.shareComment.toLowerCase().includes(searchFilter.toLowerCase()) ||
        share.rating.toLowerCase().includes(searchFilter.toLowerCase()) ||
        systemInfo.type.toLowerCase().includes(searchFilter.toLowerCase())
      );
      if (!searchMatch) return false;

      // Access filters (inclusive - show only if property is true)
      if (showWritableOnly && !share.rootWritable) return false;
      if (showReadableOnly && !share.rootReadable) return false;
      if (showModifiableOnly && !share.rootModifyable) return false;

      return true;
    })
    .sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      // Handle file count sorting (numeric)
      if (sortField === 'fileCount') {
        const aNum = (aValue as number) || 0;
        const bNum = (bValue as number) || 0;
        if (sortDirection === 'asc') {
          return aNum - bNum;
        } else {
          return bNum - aNum;
        }
      }

      // Handle string sorting
      const aStr = aValue as string;
      const bStr = bValue as string;
      if (sortDirection === 'asc') {
        return aStr.localeCompare(bStr);
      } else {
        return bStr.localeCompare(aStr);
      }
    });
  }, [shareResults, searchFilter, sortField, sortDirection, showWritableOnly, showReadableOnly, showModifiableOnly]);

  // Pagination calculations
  const totalPages = Math.ceil(filteredShares.length / pageSize);
  const currentPageData = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return filteredShares.slice(startIndex, endIndex);
  }, [filteredShares, currentPage, pageSize]);

  const handlePageChange = (page: number) => {
    setCurrentPage(page);
  };

  const handlePageSizeChange = (newPageSize: number) => {
    setPageSize(newPageSize);
    setCurrentPage(1); // Reset to first page when changing page size
  };

  const getSortIcon = (field: string) => {
    if (sortField !== field) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const handleSort = (field: 'path' | 'fileCount') => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1); // Reset to first page when sorting
  };

  const scrollToTop = () => {
    const container = document.querySelector('.share-table-wrapper');
    if (container) {
      container.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  // Handle row selection - show right panel
  const handleSelectShare = (share: ShareInfo) => {
    setSelectedShare(share);
    setShowRightPanel(true);
  };

  // Handle closing the right panel
  const handleCloseRightPanel = () => {
    setShowRightPanel(false);
    setSelectedShare(null);
  };

  // Keyboard navigation for arrow keys
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Don't handle if typing in input
      const activeElement = document.activeElement;
      if (activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA'
      )) {
        return;
      }

      if (!selectedShare) return;

      const currentIndex = currentPageData.findIndex(share =>
        share.path === selectedShare.path && share.systemId === selectedShare.systemId
      );
      if (currentIndex === -1) return;

      let newIndex = currentIndex;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          newIndex = Math.min(currentIndex + 1, currentPageData.length - 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          newIndex = Math.max(currentIndex - 1, 0);
          break;
        default:
          return;
      }

      if (newIndex !== currentIndex) {
        setSelectedShare(currentPageData[newIndex]);

        // Scroll the new row into view
        setTimeout(() => {
          const rows = tableRef.current?.querySelectorAll('tbody tr');
          if (rows && rows[newIndex]) {
            rows[newIndex].scrollIntoView({
              behavior: 'smooth',
              block: 'nearest'
            });
          }
        }, 0);
      }
    };

    if (selectedShare) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedShare, currentPageData]);

  if (shareResults.length === 0) {
    return (
      <div className="share-results">
        <div className="no-data">
          <h3>No share information found</h3>
          <p>Try uploading a different file or adjusting your filters</p>
        </div>
      </div>
    );
  }

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
          <ShareFilters
            isMinimized={isLeftPanelMinimized}
            showWritableOnly={showWritableOnly}
            onShowWritableOnlyChange={setShowWritableOnly}
            showReadableOnly={showReadableOnly}
            onShowReadableOnlyChange={setShowReadableOnly}
            showModifiableOnly={showModifiableOnly}
            onShowModifiableOnlyChange={setShowModifiableOnly}
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
                id="share-search-filter"
                value={searchFilter}
                onChange={setSearchFilter}
                placeholder="Search shares..."
                clearable
              />
              <div className="table-controls">
                <div id="share-column-dropdown-container" className="column-visibility-dropdown">
                  <button
                    className="column-visibility-button"
                    onClick={() => {
                      const dropdown = document.getElementById('share-column-dropdown');
                      dropdown?.classList.toggle('show');
                    }}
                  >
                    <span className="button-text">Columns</span>
                    <span className="dropdown-arrow">
                      <i className="fas fa-chevron-down"></i>
                    </span>
                  </button>
                  <div id="share-column-dropdown" className="column-dropdown-menu">
                    <div className="column-dropdown-item">
                      <label>
                        <input
                          type="checkbox"
                          checked={visibleColumns.path}
                          onChange={(e) => setVisibleColumns(prev => ({
                            ...prev,
                            path: e.target.checked
                          }))}
                        />
                        Share Path
                      </label>
                    </div>
                    <div className="column-dropdown-item">
                      <label>
                        <input
                          type="checkbox"
                          checked={visibleColumns.fileCount}
                          onChange={(e) => setVisibleColumns(prev => ({
                            ...prev,
                            fileCount: e.target.checked
                          }))}
                        />
                        File Count
                      </label>
                    </div>
                    <div className="column-dropdown-item">
                      <label>
                        <input
                          type="checkbox"
                          checked={visibleColumns.comment}
                          onChange={(e) => setVisibleColumns(prev => ({
                            ...prev,
                            comment: e.target.checked
                          }))}
                        />
                        Comment
                      </label>
                    </div>
                    <div className="column-dropdown-item">
                      <label>
                        <input
                          type="checkbox"
                          checked={visibleColumns.properties}
                          onChange={(e) => setVisibleColumns(prev => ({
                            ...prev,
                            properties: e.target.checked
                          }))}
                        />
                        Properties
                      </label>
                    </div>
                  </div>
                </div>
                <div className={`results-count ${filteredShares.length !== shareResults.length ? 'filters-active' : ''}`}>
                  Showing {filteredShares.length} of {shareResults.length} shares
                </div>
              </div>
            </div>
          </div>
          <div className="share-table-wrapper">
            <table className="share-table" ref={tableRef}>
              <thead>
                <tr>
                  {visibleColumns.path && (
                    <th
                      className="sortable share-path-column"
                      onClick={() => handleSort('path')}
                    >
                      Share Path
                      <span className="sort-icon">{getSortIcon('path')}</span>
                    </th>
                  )}
                  {visibleColumns.fileCount && (
                    <th
                      className="sortable share-count-column"
                      onClick={() => handleSort('fileCount')}
                    >
                      File Count
                      <span className="sort-icon">{getSortIcon('fileCount')}</span>
                    </th>
                  )}
                  {visibleColumns.comment && (
                    <th className="share-comment-column">Share Comment</th>
                  )}
                  {visibleColumns.properties && (
                    <th className="share-properties-column">Properties</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {currentPageData.map((share, index) => {
                  const isSelected = selectedShare?.path === share.path && selectedShare?.systemId === share.systemId;
                  return (
                    <tr
                      key={`${share.path}-${share.systemId}-${index}`}
                      className={isSelected ? 'selected' : ''}
                      onClick={() => handleSelectShare(share)}
                    >
                      {visibleColumns.path && (
                        <td className="system-cell">
                          <span className="system-identifier">
                            {share.path}
                          </span>
                        </td>
                      )}
                      {visibleColumns.fileCount && (
                        <td className="file-count-cell">
                          <span className="file-count">{share.fileCount || 0}</span>
                        </td>
                      )}
                      {visibleColumns.comment && (
                        <td className="comment-cell" title={share.shareComment}>
                          {share.shareComment || '-'}
                        </td>
                      )}
                      {visibleColumns.properties && (
                        <td className="properties-cell">
                          <div className="share-properties">
                            {share.listable && <span className="property-badge listable">Listable</span>}
                            {share.rootReadable && <span className="property-badge readable">Readable</span>}
                            {share.rootWritable && <span className="property-badge writable">Writable</span>}
                            {share.rootModifyable && <span className="property-badge modifiable">Modifiable</span>}
                            {share.snaffle && <span className="property-badge snaffle">Snaffle</span>}
                            {share.scanShare && <span className="property-badge scan">Scan</span>}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="pagination-controls">
              <div className="pagination-info">
                <span>
                  Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, filteredShares.length)} of {filteredShares.length} shares
                </span>
              </div>

              <div className="pagination-controls-right">
                <div className="page-size-selector">
                  <label htmlFor="share-page-size">Show:</label>
                  <select
                    id="share-page-size"
                    value={pageSize}
                    onChange={(e) => handlePageSizeChange(Number(e.target.value))}
                  >
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={200}>200</option>
                    <option value={500}>500</option>
                    <option value={1000}>1000</option>
                  </select>
                </div>

                <button className="back-to-top-button" onClick={scrollToTop}>
                  <i className="fas fa-arrow-up"></i>
                  Back to Top
                </button>

                <div className="pagination-buttons">
                  <button
                    className="pagination-button"
                    onClick={() => handlePageChange(1)}
                    disabled={currentPage === 1}
                  >
                    «
                  </button>
                  <button
                    className="pagination-button"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 1}
                  >
                    ‹
                  </button>

                  {/* Page numbers */}
                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                    let pageNum: number;
                    if (totalPages <= 5) {
                      pageNum = i + 1;
                    } else if (currentPage <= 3) {
                      pageNum = i + 1;
                    } else if (currentPage >= totalPages - 2) {
                      pageNum = totalPages - 4 + i;
                    } else {
                      pageNum = currentPage - 2 + i;
                    }

                    return (
                      <button
                        key={pageNum}
                        className={`pagination-button ${currentPage === pageNum ? 'active' : ''}`}
                        onClick={() => handlePageChange(pageNum)}
                      >
                        {pageNum}
                      </button>
                    );
                  })}

                  <button
                    className="pagination-button"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={currentPage === totalPages}
                  >
                    ›
                  </button>
                  <button
                    className="pagination-button"
                    onClick={() => handlePageChange(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    »
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <div
        className={`right-panel ${!showRightPanel ? 'hidden' : ''}`}
        style={{ width: rightPanelWidthPx }}
      >
        <div className="panel-header">
          <span>Details</span>
          <Button variant="ghost" className="close-button" onClick={handleCloseRightPanel}>
            ×
          </Button>
        </div>
        <div className="panel-content">
          <ShareDetailPanel
            selectedShare={selectedShare}
            onClose={handleCloseRightPanel}
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
