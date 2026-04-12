import { useState, useMemo, useCallback, useEffect } from 'react';
import { PAGINATION } from '../utils/constants';

interface UsePaginationOptions<T> {
  data: T[];
  initialPageSize?: number;
  initialPage?: number;
}

interface UsePaginationResult<T> {
  currentPage: number;
  pageSize: number;
  totalPages: number;
  totalItems: number;
  currentPageData: T[];
  setCurrentPage: (page: number) => void;
  setPageSize: (size: number) => void;
  goToFirstPage: () => void;
  goToLastPage: () => void;
  goToNextPage: () => void;
  goToPreviousPage: () => void;
  resetToFirstPage: () => void;
}

/**
 * Custom hook for managing pagination state
 *
 * Encapsulates:
 * - Current page and page size state
 * - Memoized slice of data for current page
 * - Navigation helpers (next, prev, first, last)
 * - Auto-reset to valid page when data changes
 */
export function usePagination<T>({
  data,
  initialPageSize = PAGINATION.DEFAULT_PAGE_SIZE,
  initialPage = 1,
}: UsePaginationOptions<T>): UsePaginationResult<T> {
  const [currentPage, setCurrentPageState] = useState(initialPage);
  const [pageSize, setPageSizeState] = useState(initialPageSize);

  const totalItems = data.length;
  const totalPages = Math.ceil(totalItems / pageSize) || 1;

  // Ensure current page is valid when data or pageSize changes
  const validCurrentPage = useMemo(() => {
    return Math.min(Math.max(1, currentPage), totalPages);
  }, [currentPage, totalPages]);

  // Auto-correct page if it becomes invalid
  useEffect(() => {
    if (currentPage !== validCurrentPage) {
      setCurrentPageState(validCurrentPage);
    }
  }, [currentPage, validCurrentPage]);

  // Memoize the current page's data slice
  const currentPageData = useMemo(() => {
    const startIndex = (validCurrentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return data.slice(startIndex, endIndex);
  }, [data, validCurrentPage, pageSize]);

  const setCurrentPage = useCallback(
    (page: number) => {
      setCurrentPageState(Math.min(Math.max(1, page), totalPages));
    },
    [totalPages]
  );

  const setPageSize = useCallback((newPageSize: number) => {
    setPageSizeState(newPageSize);
    setCurrentPageState(1); // Reset to first page when changing page size
  }, []);

  const goToFirstPage = useCallback(() => setCurrentPage(1), [setCurrentPage]);
  const goToLastPage = useCallback(
    () => setCurrentPage(totalPages),
    [setCurrentPage, totalPages]
  );
  const goToNextPage = useCallback(
    () => setCurrentPage(validCurrentPage + 1),
    [setCurrentPage, validCurrentPage]
  );
  const goToPreviousPage = useCallback(
    () => setCurrentPage(validCurrentPage - 1),
    [setCurrentPage, validCurrentPage]
  );
  const resetToFirstPage = useCallback(() => setCurrentPageState(1), []);

  return {
    currentPage: validCurrentPage,
    pageSize,
    totalPages,
    totalItems,
    currentPageData,
    setCurrentPage,
    setPageSize,
    goToFirstPage,
    goToLastPage,
    goToNextPage,
    goToPreviousPage,
    resetToFirstPage,
  };
}
