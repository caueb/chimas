import React, { useState, useMemo } from 'react';
import { extractSystemIdentifier } from '../utils/parser';

interface ShareInfo {
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

  const filteredShares = useMemo(() => {
    return shareResults
    .filter(share => {
      const systemInfo = extractSystemIdentifier(share.systemId);
      return (
        share.path.toLowerCase().includes(searchFilter.toLowerCase()) ||
        share.shareComment.toLowerCase().includes(searchFilter.toLowerCase()) ||
        share.rating.toLowerCase().includes(searchFilter.toLowerCase()) ||
        systemInfo.type.toLowerCase().includes(searchFilter.toLowerCase())
      );
    })
    .sort((a, b) => {
      let aValue: any = a[sortField];
      let bValue: any = b[sortField];
      
      // Handle file count sorting (numeric)
      if (sortField === 'fileCount') {
        aValue = aValue || 0;
        bValue = bValue || 0;
        if (sortDirection === 'asc') {
          return aValue - bValue;
        } else {
          return bValue - aValue;
        }
      }
      
      // Handle string sorting
      if (sortDirection === 'asc') {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
    });
  }, [shareResults, searchFilter, sortField, sortDirection]);

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
    <div className="share-results">
      <div className="share-controls">
        <div className="search-container">
          <div className="search-input-wrapper">
            <input
              type="text"
              placeholder="Search shares, hostname, permissions, or comments..."
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
        <div className="results-count">
          Showing {filteredShares.length} of {shareResults.length} shares
        </div>
      </div>

      <div className="share-table-container">
        <div className="share-table-wrapper">
        <table className="share-table">
          <thead>
            <tr>
              <th 
                  className="sortable share-path-column"
                onClick={() => handleSort('path')}
              >
                Share Path
                <span className="sort-icon">{getSortIcon('path')}</span>
              </th>
              <th 
                  className="sortable share-count-column"
                onClick={() => handleSort('fileCount')}
              >
                File Count
                <span className="sort-icon">{getSortIcon('fileCount')}</span>
              </th>
                <th className="share-comment-column">Share Comment</th>
                <th className="share-properties-column">Properties</th>
            </tr>
          </thead>
          <tbody>
              {currentPageData.map((share, index) => {
              return (
                  <tr key={`${share.path}-${share.systemId}-${index}`}>
                  <td className="system-cell">
                    <span className="system-identifier">
                      {share.path}
                    </span>
                  </td>
                  <td className="file-count-cell">
                    <span className="file-count">{share.fileCount || 0}</span>
                  </td>
                  <td className="comment-cell" title={share.shareComment}>
                    {share.shareComment || '-'}
                  </td>
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
  );
}; 