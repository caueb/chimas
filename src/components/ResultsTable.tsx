import React, { useEffect, useRef } from 'react';
import { FileResult, SortField, SortDirection } from '../types';
import { format } from 'date-fns';

interface ResultsTableProps {
  results: FileResult[];
  selectedResult: FileResult | null;
  onSelectResult: (result: FileResult) => void;
  sortField: SortField;
  sortDirection: SortDirection;
  onSort: (field: SortField) => void;
  visibleColumns: {
    rating: boolean;
    fullPath: boolean;
    creationTime: boolean;
    lastModified: boolean;
    size: boolean;
  };
  // Pagination props
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalResults: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  // False positive props
  falsePositives: Set<string>;
}

export const ResultsTable: React.FC<ResultsTableProps> = ({
  results,
  selectedResult,
  onSelectResult,
  sortField,
  sortDirection,
  onSort,
  visibleColumns,
  currentPage,
  pageSize,
  totalPages,
  totalResults,
  onPageChange,
  onPageSizeChange,
  falsePositives
}) => {
  const tableRef = useRef<HTMLTableElement>(null);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!selectedResult || results.length === 0) return;

      const currentIndex = results.findIndex(result => result === selectedResult);
      if (currentIndex === -1) return;

      let newIndex = currentIndex;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          newIndex = Math.min(currentIndex + 1, results.length - 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          newIndex = Math.max(currentIndex - 1, 0);
          break;
        default:
          return;
      }

      if (newIndex !== currentIndex) {
        onSelectResult(results[newIndex]);
        
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

    // Only add event listener if we have a selected result
    if (selectedResult) {
      document.addEventListener('keydown', handleKeyDown);
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedResult, results, onSelectResult]);

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy HH:mm:ss');
    } catch {
      return dateString;
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const formatFileSize = (size: string) => {
    const sizeNum = parseInt(size);
    if (isNaN(sizeNum)) return size;
    
    if (sizeNum < 1024) return `${sizeNum} B`;
    if (sizeNum < 1024 * 1024) return `${(sizeNum / 1024).toFixed(1)} KB`;
    if (sizeNum < 1024 * 1024 * 1024) return `${(sizeNum / (1024 * 1024)).toFixed(1)} MB`;
    return `${(sizeNum / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const scrollToTop = () => {
    if (tableRef.current) {
      tableRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  if (results.length === 0) {
    return (
      <div className="no-data">
        <h3>No results found</h3>
        <p>Try adjusting your filters or upload a different file</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table className="table" ref={tableRef}>
        <thead>
          <tr>
            {visibleColumns.rating && (
              <th className="rating-column" onClick={() => onSort('rating')}>
                Rating
                <span className={`sort-icon ${sortField === 'rating' ? 'active' : ''}`}>
                  {getSortIcon('rating')}
                </span>
              </th>
            )}
            {visibleColumns.fullPath && (
              <th className="path-column" onClick={() => onSort('fullPath')}>
                Full Path
                <span className={`sort-icon ${sortField === 'fullPath' ? 'active' : ''}`}>
                  {getSortIcon('fullPath')}
                </span>
              </th>
            )}
            {visibleColumns.creationTime && (
              <th className="date-column" onClick={() => onSort('creationTime')}>
                Creation Time
                <span className={`sort-icon ${sortField === 'creationTime' ? 'active' : ''}`}>
                  {getSortIcon('creationTime')}
                </span>
              </th>
            )}
            {visibleColumns.lastModified && (
              <th className="date-column" onClick={() => onSort('lastModified')}>
                Last Modified
                <span className={`sort-icon ${sortField === 'lastModified' ? 'active' : ''}`}>
                  {getSortIcon('lastModified')}
                </span>
              </th>
            )}
            {visibleColumns.size && (
              <th className="size-column" onClick={() => onSort('size')}>
                Size
                <span className={`sort-icon ${sortField === 'size' ? 'active' : ''}`}>
                  {getSortIcon('size')}
                </span>
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {results.map((result, index) => {
            // Create a stable key based on file properties
            const stableKey = `${result.fileName}-${result.fullPath}-${result.rating}-${result.size}`;
            
            // Create a stable key for the selected result for comparison
            const selectedStableKey = selectedResult ? 
              `${selectedResult.fileName}-${selectedResult.fullPath}-${selectedResult.rating}-${selectedResult.size}` : null;
            
            // Check if this result is marked as false positive
            const falsePositiveKey = `${result.fullPath}-${result.fileName}`;
            const isFalsePositive = falsePositives.has(falsePositiveKey);
            
            return (
            <tr
                key={stableKey}
              onClick={() => onSelectResult(result)}
                className={`${selectedStableKey === stableKey ? 'selected' : ''} ${isFalsePositive ? 'false-positive' : ''}`}
                style={{ cursor: 'pointer' }}
            >
              {visibleColumns.rating && (
                <td className="rating-cell">
                  <span className={`rating ${result.rating.toLowerCase()}`}>
                    {result.rating}
                  </span>
                </td>
              )}
              {visibleColumns.fullPath && (
                <td className="path-cell" title={result.fullPath}>
                  {result.fullPath}
                </td>
              )}
              {visibleColumns.creationTime && (
                <td className="date-cell">{formatDate(result.creationTime)}</td>
              )}
              {visibleColumns.lastModified && (
                <td className="date-cell">{formatDate(result.lastModified)}</td>
              )}
              {visibleColumns.size && (
                <td className="size-cell">{formatFileSize(result.size)}</td>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
      
      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="pagination-controls">
          <div className="pagination-info">
            <span>
              Showing {((currentPage - 1) * pageSize) + 1} to {Math.min(currentPage * pageSize, totalResults)} of {totalResults} results
            </span>
          </div>
          
          <div className="pagination-controls-right">
            <div className="page-size-selector">
              <label htmlFor="page-size">Show:</label>
              <select
                id="page-size"
                value={pageSize}
                onChange={(e) => onPageSizeChange(Number(e.target.value))}
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
                onClick={() => onPageChange(1)}
                disabled={currentPage === 1}
              >
                «
              </button>
              <button
                className="pagination-button"
                onClick={() => onPageChange(currentPage - 1)}
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
                    onClick={() => onPageChange(pageNum)}
                  >
                    {pageNum}
                  </button>
                );
              })}
              
              <button
                className="pagination-button"
                onClick={() => onPageChange(currentPage + 1)}
                disabled={currentPage === totalPages}
              >
                ›
              </button>
              <button
                className="pagination-button"
                onClick={() => onPageChange(totalPages)}
                disabled={currentPage === totalPages}
              >
                »
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 