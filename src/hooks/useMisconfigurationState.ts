import { useState, useCallback, useEffect } from 'react';
import {
  MisconfigurationState,
  CheckStatus,
  SecurityCategory,
  MisconfigScope,
} from '../types/Misconfiguration';
import { Severity } from '../utils/constants';

const STORAGE_KEY = 'security-baseline-state';
const LEGACY_STORAGE_KEY = 'misconfig-state';

const initialState: MisconfigurationState = {
  selectedIndex: null,
  sortField: 'severity',
  sortDirection: 'asc',
  currentPage: 1,
  pageSize: 20,
  issuesOnly: true,
  search: '',
  statusFilter: [],
  severityFilter: [],
  categoryFilter: 'all',
  scopeFilter: 'all',
};

const VALID_SORT_FIELDS: MisconfigurationState['sortField'][] = [
  'name',
  'severity',
  'gpoCount',
  'status',
  'category',
];

function loadState(): MisconfigurationState {
  const stored = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      const sortField = VALID_SORT_FIELDS.includes(parsed.sortField)
        ? parsed.sortField
        : initialState.sortField;
      return {
        ...initialState,
        ...parsed,
        sortField,
        issuesOnly: parsed.issuesOnly ?? true,
        search: parsed.search ?? '',
        statusFilter: Array.isArray(parsed.statusFilter) ? parsed.statusFilter : [],
        severityFilter: Array.isArray(parsed.severityFilter) ? parsed.severityFilter : [],
        categoryFilter: parsed.categoryFilter ?? 'all',
        scopeFilter: parsed.scopeFilter ?? 'all',
      };
    } catch {
      return initialState;
    }
  }
  return initialState;
}

export function useMisconfigurationState() {
  const [state, setState] = useState<MisconfigurationState>(loadState);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const setSelectedIndex = useCallback((index: number | null) => {
    setState(prev => ({ ...prev, selectedIndex: index }));
  }, []);

  const setSortField = useCallback((field: MisconfigurationState['sortField']) => {
    setState(prev => ({ ...prev, sortField: field }));
  }, []);

  const setSortDirection = useCallback((direction: 'asc' | 'desc') => {
    setState(prev => ({ ...prev, sortDirection: direction }));
  }, []);

  const setCurrentPage = useCallback((page: number) => {
    setState(prev => ({ ...prev, currentPage: page }));
  }, []);

  const setPageSize = useCallback((size: number) => {
    setState(prev => ({ ...prev, pageSize: size, currentPage: 1 }));
  }, []);

  const setIssuesOnly = useCallback((issuesOnly: boolean) => {
    setState(prev => ({ ...prev, issuesOnly, currentPage: 1, selectedIndex: null }));
  }, []);

  const setSearch = useCallback((search: string) => {
    setState(prev => ({ ...prev, search, currentPage: 1 }));
  }, []);

  const setStatusFilter = useCallback((statusFilter: CheckStatus[]) => {
    setState(prev => ({ ...prev, statusFilter, currentPage: 1 }));
  }, []);

  const setSeverityFilter = useCallback((severityFilter: Severity[]) => {
    setState(prev => ({ ...prev, severityFilter, currentPage: 1 }));
  }, []);

  const setCategoryFilter = useCallback((categoryFilter: SecurityCategory | 'all') => {
    setState(prev => ({ ...prev, categoryFilter, currentPage: 1 }));
  }, []);

  const setScopeFilter = useCallback((scopeFilter: MisconfigScope | 'all') => {
    setState(prev => ({ ...prev, scopeFilter, currentPage: 1 }));
  }, []);

  const resetState = useCallback(() => {
    setState(initialState);
  }, []);

  return {
    ...state,
    setSelectedIndex,
    setSortField,
    setSortDirection,
    setCurrentPage,
    setPageSize,
    setIssuesOnly,
    setSearch,
    setStatusFilter,
    setSeverityFilter,
    setCategoryFilter,
    setScopeFilter,
    resetState,
  };
}
