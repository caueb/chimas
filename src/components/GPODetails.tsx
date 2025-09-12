import React, { useState, useRef, useEffect } from 'react';
import { GPOReport } from '../utils/GPOParser';

interface GPODetailsProps {
  report: GPOReport;
  search: string;
  setSearch: (search: string) => void;
  linkedFilter: string;
  setLinkedFilter: (filter: string) => void;
  sortField: 'gpo' | 'settingsCount' | 'linked';
  setSortField: (field: 'gpo' | 'settingsCount' | 'linked') => void;
  sortDirection: 'asc' | 'desc';
  setSortDirection: (direction: 'asc' | 'desc') => void;
  currentPage: number;
  setCurrentPage: (page: number) => void;
  pageSize: number;
  setPageSize: (size: number) => void;
  selectedGPO: any;
  setSelectedGPO: (gpo: any) => void;
  selectedIndex: number;
  setSelectedIndex: (index: number) => void;
  showRightPanel: boolean;
  setShowRightPanel: (show: boolean) => void;
  isLeftPanelMinimized: boolean;
  setIsLeftPanelMinimized: (minimized: boolean) => void;
  leftPanelWidthPx: number;
  setLeftPanelWidthPx: (width: number) => void;
  rightPanelWidthPx: number;
  setRightPanelWidthPx: (width: number) => void;
  scrollTop: number;
  setScrollTop: (scrollTop: number) => void;
}

const GPODetails: React.FC<GPODetailsProps> = ({ 
  report,
  search,
  setSearch,
  linkedFilter,
  setLinkedFilter,
  sortField,
  setSortField,
  sortDirection,
  setSortDirection,
  currentPage,
  setCurrentPage,
  pageSize,
  setPageSize,
  selectedGPO,
  setSelectedGPO,
  selectedIndex,
  setSelectedIndex,
  showRightPanel,
  setShowRightPanel,
  isLeftPanelMinimized,
  setIsLeftPanelMinimized,
  leftPanelWidthPx,
  setLeftPanelWidthPx,
  rightPanelWidthPx,
  setRightPanelWidthPx,
  scrollTop,
  setScrollTop
}) => {
  
  const [draggingSide, setDraggingSide] = useState<'left' | 'right' | null>(null);
  const previousLeftWidthRef = useRef<number>(300);
  const windowWidthRef = useRef<number>(typeof window !== 'undefined' ? window.innerWidth : 1440);
  const leftResizerRef = useRef<HTMLDivElement>(null);
  const rightResizerRef = useRef<HTMLDivElement>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const tableWrapperRef = useRef<HTMLDivElement>(null);

  // Restore scroll position when component mounts
  useEffect(() => {
    if (tableWrapperRef.current && scrollTop > 0) {
      tableWrapperRef.current.scrollTop = scrollTop;
    }
  }, []);

  // Save scroll position when scrolling
  useEffect(() => {
    const tableWrapper = tableWrapperRef.current;
    if (!tableWrapper) return;

    const handleScroll = () => {
      setScrollTop(tableWrapper.scrollTop);
    };

    tableWrapper.addEventListener('scroll', handleScroll);
    return () => {
      tableWrapper.removeEventListener('scroll', handleScroll);
    };
  }, [setScrollTop]);

  // Helper function to determine if GPO is linked
  const isGPOLinked = (gpo: any) => {
    // A GPO is considered linked only if it has Link entries (not just settings)
    // Handle both old Link field and new links array for backward compatibility
    return !!(gpo.header.links?.length > 0 || gpo.header.Link);
  };

  // Helper function to parse Link field and extract enabled/forced status
  const parseLinkStatus = (linkValue: string) => {
    if (!linkValue) return { enabled: false, forced: false, cleanLink: '' };
    
    // Look for patterns like "(Enabled, Unenforced)" or "(Disabled, Enforced)" etc.
    const statusMatch = linkValue.match(/\(([^,]+),\s*([^)]+)\)/);
    if (statusMatch) {
      const firstPart = statusMatch[1].toLowerCase().trim();
      const secondPart = statusMatch[2].toLowerCase().trim();
      
      // Check if enabled (explicitly "enabled", not "disabled")
      const enabled = firstPart === 'enabled';
      
      // Check if forced (explicitly "enforced", not "unenforced")
      const forced = secondPart === 'enforced';
      
      const cleanLink = linkValue.replace(/\s*\([^)]+\)\s*$/, '').trim();
      return { enabled, forced, cleanLink };
    }
    
    return { enabled: false, forced: false, cleanLink: linkValue };
  };


  // Helper function to get overall status from all links
  const getOverallLinkStatus = (gpo: any) => {
    // Handle both old Link field and new links array for backward compatibility
    const links = gpo.header.links || (gpo.header.Link ? [gpo.header.Link] : []);
    
    if (links.length === 0) {
      return { enabled: false, forced: false };
    }
    
    let enabled = false;
    let forced = false;
    
    for (const link of links) {
      const status = parseLinkStatus(link);
      if (status.enabled) enabled = true;
      if (status.forced) forced = true;
    }
    
    return { enabled, forced };
  };

  // Helper function for single selection dropdowns
  const handleFilterChange = (filterType: 'linked', value: string) => {
    if (filterType === 'linked') {
      setLinkedFilter(value);
    }
    
    setCurrentPage(1);
  };

  // Filter and sort GPOs
  const filteredAndSorted = React.useMemo(() => {
    let gpos = [...report.gpos];

    // Filter by search
    if (search.trim()) {
      const searchTerm = search.toLowerCase();
      gpos = gpos.filter(gpo => {
        const gpoName = (gpo.header.gpo || '').toLowerCase();
        const pathInSysvol = (gpo.header.pathInSysvol || '').toLowerCase();
        const links = gpo.header.links || (gpo.header.Link ? [gpo.header.Link] : []);
        const linkText = links.join(' ').toLowerCase();
        
        return gpoName.includes(searchTerm) ||
               pathInSysvol.includes(searchTerm) ||
               linkText.includes(searchTerm);
      });
    }

    // Filter by Linked status
    if (linkedFilter !== 'all') {
      gpos = gpos.filter(gpo => {
        const isLinked = isGPOLinked(gpo);
        return linkedFilter === (isLinked ? 'yes' : 'no');
      });
    }


    // Sort
    gpos.sort((a, b) => {
      let aValue: any = '';
      let bValue: any = '';

      switch (sortField) {
        case 'gpo':
          aValue = (a.header.gpo || '').toLowerCase();
          bValue = (b.header.gpo || '').toLowerCase();
          break;
        case 'settingsCount':
          aValue = a.settings.length;
          bValue = b.settings.length;
          break;
        case 'linked':
          aValue = isGPOLinked(a);
          bValue = isGPOLinked(b);
          break;
      }

      if (aValue === bValue) {
        return (a.header.gpo || '').toLowerCase() < (b.header.gpo || '').toLowerCase() ? -1 : 1;
      }
      return sortDirection === 'asc' ? (aValue > bValue ? 1 : -1) : (aValue < bValue ? 1 : -1);
    });

    return gpos;
  }, [report.gpos, search, linkedFilter, sortField, sortDirection]);

  const totalPages = Math.ceil(filteredAndSorted.length / pageSize) || 1;
  const pageStart = (currentPage - 1) * pageSize;
  const currentPageData = filteredAndSorted.slice(pageStart, pageStart + pageSize);
  

  // Panel management functions
  const handleSelectGPO = (gpo: any, index?: number) => {
    setSelectedGPO(gpo);
    setShowRightPanel(true);
    if (index !== undefined) {
      setSelectedIndex(index);
    }
  };

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const currentIndex = selectedIndex;
      let newIndex = currentIndex;
      
      if (e.key === 'ArrowDown') {
        newIndex = Math.min(currentIndex + 1, currentPageData.length - 1);
      } else {
        newIndex = Math.max(currentIndex - 1, 0);
      }
      
      if (newIndex !== currentIndex && newIndex >= 0 && newIndex < currentPageData.length) {
        setSelectedIndex(newIndex);
        const gpo = currentPageData[newIndex];
        handleSelectGPO(gpo, newIndex);
        
        // Scroll the selected row into view
        setTimeout(() => {
          const tableBody = tableRef.current?.querySelector('tbody');
          const selectedRow = tableBody?.children[newIndex] as HTMLElement;
          if (selectedRow) {
            selectedRow.scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
              inline: 'nearest'
            });
          }
        }, 0);
      }
    }
  };


  // Scroll to selected row when selection changes
  React.useEffect(() => {
    if (selectedIndex >= 0 && selectedIndex < currentPageData.length) {
      setTimeout(() => {
        const tableBody = tableRef.current?.querySelector('tbody');
        const selectedRow = tableBody?.children[selectedIndex] as HTMLElement;
        if (selectedRow) {
          selectedRow.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
          });
        }
      }, 0);
    }
  }, [selectedIndex, currentPageData.length]);

  const handleCloseRightPanel = () => {
    setShowRightPanel(false);
    setSelectedGPO(null);
    setSelectedIndex(-1);
  };

  const handleToggleLeftPanel = () => {
    const next = !isLeftPanelMinimized;
    if (next) {
      previousLeftWidthRef.current = leftPanelWidthPx;
      setLeftPanelWidthPx(50);
    } else {
      const ww = window.innerWidth;
      const MIN_LEFT = 180;
      const MIN_CENTER = 480;
      const maxLeft = ww - (showRightPanel ? rightPanelWidthPx : 0) - MIN_CENTER;
      const restored = Math.max(MIN_LEFT, Math.min(previousLeftWidthRef.current || 300, maxLeft));
      setLeftPanelWidthPx(restored);
    }
    setIsLeftPanelMinimized(next);
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
    setCurrentPage(1);
  };

  const getSortIcon = (field: typeof sortField) => {
    if (sortField !== field) return 'sortable';
    return `sortable ${sortDirection}`;
  };

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString() + ' ' + date.toLocaleTimeString();
    } catch {
      return dateStr;
    }
  };

  // Initialize panel sizes from props (no localStorage needed - managed by App.tsx)
  useEffect(() => {
    const ww = window.innerWidth;
    windowWidthRef.current = ww;
    // Panel widths are already set from props, just ensure they're within bounds
    const MIN_LEFT = 180;
    const MIN_RIGHT = 280;
    const MIN_CENTER = 480;
    
    if (leftPanelWidthPx < MIN_LEFT || leftPanelWidthPx > ww - MIN_CENTER) {
      const maxLeft = Math.max(MIN_LEFT, ww - (showRightPanel ? rightPanelWidthPx : 0) - MIN_CENTER);
      setLeftPanelWidthPx(Math.max(MIN_LEFT, Math.min(leftPanelWidthPx, maxLeft)));
    }
    
    if (rightPanelWidthPx < MIN_RIGHT || rightPanelWidthPx > ww - MIN_CENTER) {
      const maxRight = Math.max(MIN_RIGHT, ww - (isLeftPanelMinimized ? 50 : leftPanelWidthPx) - MIN_CENTER);
      setRightPanelWidthPx(Math.max(MIN_RIGHT, Math.min(rightPanelWidthPx, maxRight)));
    }
    
    previousLeftWidthRef.current = leftPanelWidthPx;
  }, []);

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
        let newLeft = e.clientX;
        const maxLeft = ww - (showRightPanel ? rightPanelWidthPx : 0) - MIN_CENTER;
        newLeft = Math.max(MIN_LEFT, Math.min(newLeft, maxLeft));
        setLeftPanelWidthPx(newLeft);
        previousLeftWidthRef.current = newLeft;
      } else if (draggingSide === 'right') {
        if (!showRightPanel) return;
        let newRight = ww - e.clientX;
        const maxRight = ww - (isLeftPanelMinimized ? 50 : leftPanelWidthPx) - MIN_CENTER;
        newRight = Math.max(MIN_RIGHT, Math.min(newRight, maxRight));
        setRightPanelWidthPx(newRight);
      }
    };
    const onMouseUp = () => { if (draggingSide) setDraggingSide(null); };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [draggingSide, isLeftPanelMinimized, leftPanelWidthPx, rightPanelWidthPx, showRightPanel]);

  return (
    <div className="main-content">
      {/* Left Panel - Filters */}
      <div 
        className={`left-panel ${isLeftPanelMinimized ? 'minimized' : ''}`}
        style={{ width: isLeftPanelMinimized ? 50 : leftPanelWidthPx }}
      >
        <div className="panel-header">
          <span>Filters</span>
          <button className="minimize-button" onClick={handleToggleLeftPanel}>
            <i className={`fas fa-chevron-${isLeftPanelMinimized ? 'right' : 'left'}`}></i>
          </button>
        </div>
        <div className="panel-content">
          <div className="filter-section">
            <label>Linked</label>
            <select value={linkedFilter} onChange={(e) => { handleFilterChange('linked', e.target.value); }}>
              <option value="all">All</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
        </div>
      </div>

      {/* Center Panel - Table */}
      <div 
        className={`center-panel ${isLeftPanelMinimized ? 'expanded' : ''} ${showRightPanel ? 'with-right-panel' : ''}`}
        style={{ left: isLeftPanelMinimized ? 50 : leftPanelWidthPx, right: showRightPanel ? rightPanelWidthPx : 0 }}
      >
        <div className="table-container">
          <div className="table-header">
            <div className="table-header-content">
              <div className="search-container">
                <div className="search-input-wrapper">
                  <input
                    type="text"
                    placeholder="Search GPO name, path..."
                    value={search}
                    onChange={(e) => { setSearch(e.target.value); setCurrentPage(1); }}
                  />
                  {search && (
                    <button
                      className="search-clear-button"
                      onClick={() => setSearch('')}
                      type="button"
                    >
                      ×
                    </button>
                  )}
                </div>
              </div>
              <div className="table-controls">
                <div className="results-count">
                  Showing {filteredAndSorted.length} of {report.gpos.length} GPOs
                </div>
              </div>
            </div>
          </div>

          <div className="table-wrapper" ref={tableWrapperRef}>
            <table ref={tableRef} className="gpo-details-table" onKeyDown={handleKeyDown} tabIndex={0}>
              <thead>
                <tr>
                  <th className={`gpo-name-column ${getSortIcon('gpo')}`} onClick={() => handleSort('gpo')}>
                    GPO Name
                  </th>
                  <th className={`settings-count-column ${getSortIcon('settingsCount')}`} onClick={() => handleSort('settingsCount')}>
                    Settings Count
                  </th>
                  <th className={`linked-column ${getSortIcon('linked')}`} onClick={() => handleSort('linked')}>
                    Linked
                  </th>
                </tr>
              </thead>
              <tbody>
                {currentPageData.length === 0 ? (
                  <tr>
                    <td colSpan={3}>
                      <div className="no-data">No matching GPOs found</div>
                    </td>
                  </tr>
                ) : (
                  currentPageData.map((gpo, index) => {
                    const overallStatus = getOverallLinkStatus(gpo);
                    const isSelected = selectedGPO === gpo || selectedIndex === index;
                    return (
                      <tr 
                        key={index} 
                        className={isSelected ? 'selected' : ''} 
                        onClick={() => handleSelectGPO(gpo, index)}
                      >
                        <td className="gpo-name-cell path-cell">
                          <div className="path">
                            <strong>{gpo.header.gpo || 'Unknown GPO'}</strong>
                            {gpo.header.pathInSysvol && (
                              <div className="path-detail">
                                <small>{gpo.header.pathInSysvol}</small>
                              </div>
                            )}
                          </div>
                        </td>
                        <td className="settings-count-cell">{gpo.settings.length}</td>
                        <td className="linked-cell">
                          <span className={`policy-status ${isGPOLinked(gpo) ? 'enabled' : 'disabled'}`}>
                            {isGPOLinked(gpo) ? 'Yes' : 'No'}
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="pagination-controls">
            <div className="pagination-info">Page {currentPage} of {totalPages}</div>
            <div className="pagination-controls-right">
              <div className="page-size-selector">
                <label>Rows per page:</label>
                <select value={pageSize} onChange={(e) => { setPageSize(parseInt(e.target.value, 10)); setCurrentPage(1); }}>
                  <option value={25}>25</option>
                  <option value={50}>50</option>
                  <option value={100}>100</option>
                </select>
              </div>
              <div className="pagination-buttons">
                <button 
                  className={`pagination-button ${currentPage === 1 ? 'disabled' : ''}`} 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(1)}
                >
                  {'<<'}
                </button>
                <button 
                  className={`pagination-button ${currentPage === 1 ? 'disabled' : ''}`} 
                  disabled={currentPage === 1}
                  onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                >
                  {'<'}
                </button>
                <button 
                  className={`pagination-button ${currentPage === totalPages ? 'disabled' : ''}`} 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                >
                  {'>'}
                </button>
                <button 
                  className={`pagination-button ${currentPage === totalPages ? 'disabled' : ''}`} 
                  disabled={currentPage === totalPages}
                  onClick={() => setCurrentPage(totalPages)}
                >
                  {'>>'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right Panel - Details */}
      <div 
        className={`right-panel ${selectedGPO === null ? 'hidden' : ''}`}
        style={{ width: rightPanelWidthPx }}
      >
        <div className="panel-header">
          <span>GPO Details</span>
          <button className="close-button" onClick={handleCloseRightPanel}>×</button>
        </div>
        <div className="panel-content">
          {selectedGPO ? (
            <div className="detail-panel">
              <div className="detail-section horizontal">
                <div className="detail-label">GPO Name</div>
                <div className="detail-value">{selectedGPO.header.gpo || 'Unknown GPO'}</div>
              </div>
              
              {selectedGPO.header.gpoId && (
                <div className="detail-section horizontal">
                  <div className="detail-label">GPO ID</div>
                  <div className="detail-value path">{selectedGPO.header.gpoId}</div>
                </div>
              )}
              
              {selectedGPO.header.gpoStatus && (
                <div className="detail-section horizontal">
                  <div className="detail-label">Status</div>
                  <div className="detail-value">
                    <span className={`policy-status ${selectedGPO.header.gpoStatus.toLowerCase() === 'current' ? 'enabled' : 'disabled'}`}>
                      {selectedGPO.header.gpoStatus}
                    </span>
                  </div>
                </div>
              )}
              
              {selectedGPO.header.dateCreated && (
                <div className="detail-section horizontal">
                  <div className="detail-label">Date Created</div>
                  <div className="detail-value">{formatDate(selectedGPO.header.dateCreated)}</div>
                </div>
              )}
              
              {selectedGPO.header.dateModified && (
                <div className="detail-section horizontal">
                  <div className="detail-label">Date Modified</div>
                  <div className="detail-value">{formatDate(selectedGPO.header.dateModified)}</div>
                </div>
              )}
              
              {selectedGPO.header.pathInSysvol && (
                <div className="detail-section horizontal">
                  <div className="detail-label">SYSVOL Path</div>
                  <div className="detail-value path">{selectedGPO.header.pathInSysvol}</div>
                </div>
              )}
              
              <div className="detail-section horizontal">
                <div className="detail-label">Computer Policy</div>
                <div className="detail-value">
                  <span className={`policy-status ${(selectedGPO.header.computerPolicy || 'Not Configured').toLowerCase()}`}>
                    {selectedGPO.header.computerPolicy || 'Not Configured'}
                  </span>
                </div>
              </div>
              
              <div className="detail-section horizontal">
                <div className="detail-label">User Policy</div>
                <div className="detail-value">
                  <span className={`policy-status ${(selectedGPO.header.userPolicy || 'Not Configured').toLowerCase()}`}>
                    {selectedGPO.header.userPolicy || 'Not Configured'}
                  </span>
                </div>
              </div>
              
              
              
              {(() => {
                const links = selectedGPO.header.links || (selectedGPO.header.Link ? [selectedGPO.header.Link] : []);
                return links.length > 0 && (
                  <div className="detail-section">
                    <div className="detail-label">Link Details ({links.length} link{links.length > 1 ? 's' : ''})</div>
                    <div className="link-list">
                      {links.map((link: string, index: number) => {
                        const status = parseLinkStatus(link);
                        return (
                          <div key={index} className="link-item">
                            <div className="link-path">{status.cleanLink}</div>
                            <div className="link-status">
                              <span className={`policy-status ${status.enabled ? 'enabled' : 'disabled'}`}>
                                {status.enabled ? 'Enabled' : 'Disabled'}
                              </span>
                              <span className={`policy-status ${status.forced ? 'enabled' : 'disabled'}`}>
                                {status.forced ? 'Enforced' : 'Unenforced'}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}
              
              <div className="detail-section horizontal">
                <div className="detail-label">Settings Count</div>
                <div className="detail-value">{selectedGPO.settings.length}</div>
              </div>
              
              {/* Show additional header fields */}
              {Object.entries(selectedGPO.header).map(([key, value]) => {
                if (['gpo', 'gpoId', 'gpoStatus', 'dateCreated', 'dateModified', 'pathInSysvol', 'computerPolicy', 'userPolicy', 'Link', 'links'].includes(key)) {
                  return null;
                }
                return (
                  <div key={key} className="detail-section horizontal">
                    <div className="detail-label">{key}</div>
                    <div className="detail-value">{String(value)}</div>
                  </div>
                );
              })}
            </div>
          ) : null}
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
};

export default GPODetails;
