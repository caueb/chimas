import { useState, useMemo, useCallback } from 'react';
import { FileResult, SortField, SortDirection, CustomFilter } from '../types';
import { CREDENTIALS_KEYWORDS, RATING_ORDER } from '../utils/constants';

interface UseFilteringOptions {
  data: FileResult[];
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

interface UseFilteringResult {
  filteredResults: FileResult[];
  filters: FilterState;
  setRatingFilter: (ratings: string[]) => void;
  setSearchFilter: (search: string) => void;
  setFileExtensionFilter: (extensions: string[]) => void;
  setCredentialsFilter: (enabled: boolean) => void;
  setScriptsConfigsFilter: (enabled: boolean) => void;
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
  credentialsFilter: false,
  scriptsConfigsFilter: false,
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
 * - Credentials detection filter with smart keyword matching
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

    // Apply credentials filter
    if (filters.credentialsFilter) {
      filtered = applyCredentialsFilter(filtered);
    }

    // Apply scripts & configs filter
    if (filters.scriptsConfigsFilter) {
      const scriptExtensions = ['ps1', 'bat', 'cmd', 'vbs', 'js', 'config', 'xml', 'ini', 'conf', 'yaml', 'yml', 'json'];
      filtered = filtered.filter((result) => {
        const ext = result.fileName.split('.').pop()?.toLowerCase() || '';
        return scriptExtensions.includes(ext);
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
        aValue = new Date(aValue).getTime();
        bValue = new Date(bValue).getTime();
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

  const setCredentialsFilter = useCallback((enabled: boolean) => {
    setFilters((prev) => ({ ...prev, credentialsFilter: enabled }));
  }, []);

  const setScriptsConfigsFilter = useCallback((enabled: boolean) => {
    setFilters((prev) => ({ ...prev, scriptsConfigsFilter: enabled }));
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
    setCredentialsFilter,
    setScriptsConfigsFilter,
    setCustomFilters,
    setSortField,
    setSortDirection,
    handleSort,
    resetFilters,
  };
}

// Helper functions for credentials filtering (extracted from App.tsx)

/**
 * Check if matchContext looks like a rule name or configuration
 */
function isRuleOrConfig(context: string): boolean {
  const contextTrimmed = context.trim();
  if (!contextTrimmed) return false;

  // Check for comma-separated camelCase patterns (like "HasPassword,LookNearbyFor.txtFiles")
  if (/^[A-Z][a-zA-Z]*(?:,[A-Z][a-zA-Z]*)+/.test(contextTrimmed)) {
    return true;
  }

  // Check for camelCase patterns that look like rule names (multiple capital letters)
  if (/^[A-Z][a-z]*[A-Z]/.test(contextTrimmed) && !/\s/.test(contextTrimmed)) {
    if (contextTrimmed.length > 30) {
      return true;
    }
  }

  // Check for patterns that look like configuration strings
  if (
    /[A-Z][a-zA-Z]*[A-Z][a-zA-Z]*(?:[,;]|\s+)[A-Z][a-zA-Z]*/.test(
      contextTrimmed
    )
  ) {
    return true;
  }

  return false;
}

/**
 * Check if matchContext is just a filename or only extensions
 */
function isJustFilename(context: string, fileName: string): boolean {
  const contextLower = context.trim().toLowerCase();
  const fileNameLower = fileName.toLowerCase();

  if (
    contextLower === fileNameLower ||
    contextLower === fileNameLower.replace(/^.*[\\/]/, '')
  ) {
    return true;
  }

  // Check if matchContext is just a common file extension
  const extensionPattern =
    /^\.([a-z0-9]{1,6})(\.(bak|old|tmp|temp|swp|orig|backup|copy|~))?$/i;
  if (extensionPattern.test(contextLower)) {
    return true;
  }

  // Check if matchContext is very short and doesn't contain meaningful content
  if (
    contextLower.length < 20 &&
    !/\s/.test(contextLower) &&
    !/[a-z]{4,}/.test(contextLower)
  ) {
    return true;
  }

  return false;
}

/**
 * Apply credentials filter with smart detection
 */
function applyCredentialsFilter(results: FileResult[]): FileResult[] {
  return results.filter((result) => {
    const fileNameLower = result.fileName.toLowerCase();

    // Check if filename contains strong credential keywords (length >= 5)
    const strongFileNameKeywords = CREDENTIALS_KEYWORDS.filter(
      (k) => k.length >= 5
    );
    const fileNameHasKeyword = strongFileNameKeywords.some((keyword) =>
      fileNameLower.includes(keyword.toLowerCase())
    );
    if (fileNameHasKeyword) return true;

    // Get and validate matchContext
    const matchContext = (result.matchContext || '').trim();
    const hasValidMatchContext =
      matchContext &&
      !isJustFilename(matchContext, result.fileName) &&
      !isRuleOrConfig(matchContext);

    // Filter matchedStrings to exclude filenames, extensions, and rule/config patterns
    const matchedStrings = (result.matchedStrings || [])
      .map((s) => (s || '').trim())
      .filter(
        (s) =>
          s.length > 0 &&
          !isJustFilename(s, result.fileName) &&
          !isRuleOrConfig(s)
      );

    // Drop double-extension backup files when there is no real content
    const doubleExtensionPattern =
      /\.[a-z0-9]{1,6}\.(bak|old|tmp|temp|swp|orig|backup|copy|pdf|docx|xlsx|pptx|zip|rar|tar|gz|bz2|7z|exe|dll|sys|bin|ini|cfg|conf|config|properties|yml|yaml|env|sh|bat|cmd|ps1|vbs|js|py|java|cpp|c|h|hpp|cs|php|rb|pl|sql|db|sqlite|mdb|accdb|ldf|mdf|dbf|dwg|dxf|psd|ai|eps|svg|png|jpg|jpeg|gif|bmp|tiff|ico|mp3|mp4|avi|mov|wmv|flv|mkv|iso|img|vmdk|vdi|vhd|ova|ovf|~)$/;
    const isDoubleExtensionFile = doubleExtensionPattern.test(fileNameLower);
    if (
      isDoubleExtensionFile &&
      !hasValidMatchContext &&
      matchedStrings.length === 0
    ) {
      return false;
    }

    // Skip if no valid content to check
    if (!hasValidMatchContext && matchedStrings.length === 0) {
      return false;
    }

    // Build search text from valid content only
    const searchText = [
      ...(hasValidMatchContext ? [matchContext] : []),
      ...matchedStrings,
    ]
      .join(' ')
      .toLowerCase();

    // Check if any keyword appears in the actual content
    return CREDENTIALS_KEYWORDS.some((keyword) =>
      searchText.includes(keyword.toLowerCase())
    );
  });
}
