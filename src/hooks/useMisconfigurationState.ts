import { useState, useCallback, useEffect } from 'react';
import { MisconfigurationState } from '../types/Misconfiguration';

const STORAGE_KEY = 'misconfig-state';

const initialState: MisconfigurationState = {
  selectedIndex: null,
  sortField: 'severity',
  sortDirection: 'asc',
  currentPage: 1,
  pageSize: 20,
};

export function useMisconfigurationState() {
  const [state, setState] = useState<MisconfigurationState>(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      try {
        return { ...initialState, ...JSON.parse(stored) };
      } catch {
        return initialState;
      }
    }
    return initialState;
  });

  // Persist to localStorage
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
    resetState,
  };
}
