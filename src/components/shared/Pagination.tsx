import React from 'react';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalResults: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  pageSizeOptions?: number[];
  showBackToTop?: boolean;
  onBackToTop?: () => void;
}

/**
 * Shared Pagination component for consistent page controls across all views.
 *
 * Extracted from ResultsTable.tsx pagination pattern.
 * Features:
 * - Page info display (showing X to Y of Z results)
 * - Page size selector
 * - Back to top button (optional)
 * - Page number buttons with smart windowing
 * - First/Last/Prev/Next navigation
 */
export const Pagination: React.FC<PaginationProps> = ({
  currentPage,
  totalPages,
  pageSize,
  totalResults,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [50, 100, 200, 500, 1000],
  showBackToTop = true,
  onBackToTop,
}) => {
  if (totalPages <= 1) {
    return null;
  }

  const startItem = (currentPage - 1) * pageSize + 1;
  const endItem = Math.min(currentPage * pageSize, totalResults);

  // Calculate which page numbers to show (window of 5)
  const getPageNumbers = (): number[] => {
    const pages: number[] = [];
    const windowSize = 5;

    if (totalPages <= windowSize) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else if (currentPage <= 3) {
      for (let i = 1; i <= windowSize; i++) {
        pages.push(i);
      }
    } else if (currentPage >= totalPages - 2) {
      for (let i = totalPages - windowSize + 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      for (let i = currentPage - 2; i <= currentPage + 2; i++) {
        pages.push(i);
      }
    }

    return pages;
  };

  return (
    <div className="pagination-controls">
      <div className="pagination-info">
        <span>
          Showing {startItem} to {endItem} of {totalResults} results
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
            {pageSizeOptions.map((size) => (
              <option key={size} value={size}>
                {size}
              </option>
            ))}
          </select>
        </div>

        {showBackToTop && onBackToTop && (
          <button className="back-to-top-button" onClick={onBackToTop}>
            <i className="fas fa-arrow-up"></i>
            Back to Top
          </button>
        )}

        <div className="pagination-buttons">
          <button
            className="pagination-button"
            onClick={() => onPageChange(1)}
            disabled={currentPage === 1}
            title="First page"
          >
            «
          </button>
          <button
            className="pagination-button"
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage === 1}
            title="Previous page"
          >
            ‹
          </button>

          {getPageNumbers().map((pageNum) => (
            <button
              key={pageNum}
              className={`pagination-button ${currentPage === pageNum ? 'active' : ''}`}
              onClick={() => onPageChange(pageNum)}
            >
              {pageNum}
            </button>
          ))}

          <button
            className="pagination-button"
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            title="Next page"
          >
            ›
          </button>
          <button
            className="pagination-button"
            onClick={() => onPageChange(totalPages)}
            disabled={currentPage === totalPages}
            title="Last page"
          >
            »
          </button>
        </div>
      </div>
    </div>
  );
};
