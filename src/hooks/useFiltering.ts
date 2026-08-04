import { useState, useMemo, useCallback } from 'react';
import { FileResult, SortField, SortDirection, CustomFilter } from '../types';
import { RATING_ORDER } from '../utils/constants';
import { safeDateTimestamp } from '../utils/parser';

interface UseFilteringOptions {
  data: FileResult[];
}

interface FilterState {
  ratingFilter: string[];
  searchFilter: string;
  fileExtensionFilter: string[];
  customFilters: CustomFilter[];
  sortField: SortField;
  sortDirection: SortDirection;
}

interface UseFilteringResult {
  filteredResults: FileResult[];
  filters: FilterState;
  setRatingFilter: (ratings: string[]) => void;
  setSearchFilter: (search: string) => void;
  setFileExtensionFilter: (extensions: string[]) => void;
  setCustomFilters: (
    filters: CustomFilter[] | ((prev: CustomFilter[]) => CustomFilter[])
  ) => void;
  setSortField: (field: SortField) => void;
  setSortDirection: (direction: SortDirection) => void;
  handleSort: (field: SortField) => void;
  resetFilters: () => void;
}

const initialFilterState: FilterState = {
  ratingFilter: ['all'],
  searchFilter: '',
  fileExtensionFilter: [],
  customFilters: [],
  sortField: 'rating',
  sortDirection: 'desc',
};

/**
 * Custom hook for filtering and sorting FileResult data
 *
 * Consolidates filtering logic from App.tsx (lines 738-942)
 *
 * Features:
 * - Rating filter (all, black, red, yellow, green)
 * - Full-text search across fileName, fullPath, matchContext, matchedStrings
 * - File extension filter
 * - Custom exclusion filters
 * - Multi-level stable sorting
 */
export function useFiltering({
  data,
}: UseFilteringOptions): UseFilteringResult {
  const [filters, setFilters] = useState<FilterState>(initialFilterState);

  // Memoize filtered and sorted results
  const filteredResults = useMemo(() => {
    let filtered = data;

    // Apply rating filter
    if (!filters.ratingFilter.includes('all')) {
      filtered = filtered.filter((result) =>
        filters.ratingFilter.includes(result.rating.toLowerCase())
      );
    }

    // Apply search filter
    if (filters.searchFilter) {
      const searchLower = filters.searchFilter.toLowerCase();
      filtered = filtered.filter(
        (result) =>
          result.fileName.toLowerCase().includes(searchLower) ||
          result.fullPath.toLowerCase().includes(searchLower) ||
          result.matchContext.toLowerCase().includes(searchLower) ||
          result.matchedStrings.some((str) =>
            str.toLowerCase().includes(searchLower)
          )
      );
    }

    // Apply file extension filter
    if (filters.fileExtensionFilter.length > 0) {
      filtered = filtered.filter((result) => {
        const fileName = result.fileName.toLowerCase();
        return filters.fileExtensionFilter.some((extension) =>
          fileName.endsWith(`.${extension}`)
        );
      });
    }


    // Apply custom filters (exclusions)
    if (filters.customFilters.length > 0) {
      filtered = filtered.filter((result) => {
        const resultText = [
          result.fileName,
          result.fullPath,
          result.matchContext,
          ...result.matchedStrings,
        ]
          .join(' ')
          .toLowerCase();

        return !filters.customFilters.some((filter) =>
          resultText.includes(filter.text.toLowerCase())
        );
      });
    }

    // Sort results
    const sortedResults = [...filtered].sort((a, b) => {
      let aValue: string | number = a[filters.sortField] as string | number;
      let bValue: string | number = b[filters.sortField] as string | number;

      if (filters.sortField === 'rating') {
        aValue = RATING_ORDER[aValue] || 0;
        bValue = RATING_ORDER[bValue] || 0;
      } else if (filters.sortField === 'riskScore') {
        aValue = a.riskScore?.total || 0;
        bValue = b.riskScore?.total || 0;
      } else if (filters.sortField === 'size') {
        aValue = parseInt(String(aValue)) || 0;
        bValue = parseInt(String(bValue)) || 0;
      } else if (
        filters.sortField === 'creationTime' ||
        filters.sortField === 'lastModified'
      ) {
        aValue = safeDateTimestamp(aValue as string);
        bValue = safeDateTimestamp(bValue as string);
      } else {
        aValue = String(aValue).toLowerCase();
        bValue = String(bValue).toLowerCase();
      }

      // Primary sort
      if (filters.sortDirection === 'asc') {
        if (aValue !== bValue) return aValue > bValue ? 1 : -1;
      } else {
        if (aValue !== bValue) return aValue < bValue ? 1 : -1;
      }

      // Secondary sort by fileName for stable ordering
      const aFileName = String(a.fileName).toLowerCase();
      const bFileName = String(b.fileName).toLowerCase();
      if (aFileName !== bFileName) return aFileName > bFileName ? 1 : -1;

      // Tertiary sort by fullPath for complete stability
      return String(a.fullPath).toLowerCase() >
        String(b.fullPath).toLowerCase()
        ? 1
        : -1;
    });

    return sortedResults;
  }, [data, filters]);

  // Setter functions
  const setRatingFilter = useCallback((ratings: string[]) => {
    setFilters((prev) => ({ ...prev, ratingFilter: ratings }));
  }, []);

  const setSearchFilter = useCallback((search: string) => {
    setFilters((prev) => ({ ...prev, searchFilter: search }));
  }, []);

  const setFileExtensionFilter = useCallback((extensions: string[]) => {
    setFilters((prev) => ({ ...prev, fileExtensionFilter: extensions }));
  }, []);

  const setCustomFilters = useCallback(
    (
      customFilters: CustomFilter[] | ((prev: CustomFilter[]) => CustomFilter[])
    ) => {
      setFilters((prev) => ({
        ...prev,
        customFilters:
          typeof customFilters === 'function'
            ? customFilters(prev.customFilters)
            : customFilters,
      }));
    },
    []
  );

  const setSortField = useCallback((sortField: SortField) => {
    setFilters((prev) => ({ ...prev, sortField }));
  }, []);

  const setSortDirection = useCallback((sortDirection: SortDirection) => {
    setFilters((prev) => ({ ...prev, sortDirection }));
  }, []);

  const handleSort = useCallback((field: SortField) => {
    setFilters((prev) => {
      if (prev.sortField === field) {
        return {
          ...prev,
          sortDirection: prev.sortDirection === 'asc' ? 'desc' : 'asc',
        };
      }
      return { ...prev, sortField: field, sortDirection: 'desc' };
    });
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(initialFilterState);
  }, []);

  return {
    filteredResults,
    filters,
    setRatingFilter,
    setSearchFilter,
    setFileExtensionFilter,
    setCustomFilters,
    setSortField,
    setSortDirection,
    handleSort,
    resetFilters,
  };
}
