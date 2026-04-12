import { useState, useEffect, useCallback } from 'react';
import { GPOReport, Gpo } from '../utils/GPOParser';
import { GPODetailsSortField, GPOResultsSortField } from '../types';
import { getStoredPct, setStoredPct } from './useLocalStorage';

// GPO List state interface
interface GPOListState {
  search: string;
  linkedFilter: string;
  sortField: GPODetailsSortField;
  sortDirection: 'asc' | 'desc';
  currentPage: number;
  pageSize: number;
  selectedGPO: Gpo | null;
  selectedIndex: number;
  scrollTop: number;
}

// GPO Settings state interface
interface GPOSettingsState {
  search: string;
  scopeFilter: string;
  categoryFilter: string;
  currentPage: number;
  pageSize: number;
  sortField: GPOResultsSortField;
  sortDirection: 'asc' | 'desc';
  selectedIndex: number | null;
  showExportDropdown: boolean;
  scrollTop: number;
}

interface UseGPOState {
  // Core GPO data
  GPOReport: GPOReport | null;
  setGPOReport: (report: GPOReport | null) => void;

  // GPO List (GPO Details view) state
  gpoList: GPOListState;
  setGpoSearch: (search: string) => void;
  setGpoLinkedFilter: (filter: string) => void;
  setGpoSortField: (field: GPODetailsSortField) => void;
  setGpoSortDirection: (direction: 'asc' | 'desc') => void;
  setGpoCurrentPage: (page: number) => void;
  setGpoPageSize: (size: number) => void;
  setSelectedGPO: (gpo: Gpo | null) => void;
  setSelectedGPOIndex: (index: number) => void;
  setGpoListScrollTop: (top: number) => void;

  // GPO Settings (GPO Results view) state
  gpoSettings: GPOSettingsState;
  setGpoSettingsSearch: (search: string) => void;
  setGpoSettingsScopeFilter: (filter: string) => void;
  setGpoSettingsCategoryFilter: (filter: string) => void;
  setGpoSettingsCurrentPage: (page: number) => void;
  setGpoSettingsPageSize: (size: number) => void;
  setGpoSettingsSortField: (field: GPOResultsSortField) => void;
  setGpoSettingsSortDirection: (direction: 'asc' | 'desc') => void;
  setGpoSettingsSelectedIndex: (index: number | null) => void;
  setGpoSettingsShowExportDropdown: (show: boolean) => void;
  setGpoSettingsScrollTop: (top: number) => void;

  // Actions
  clearGPOState: () => void;
}

const initialGPOListState: GPOListState = {
  search: '',
  linkedFilter: 'all',
  sortField: 'gpo',
  sortDirection: 'asc',
  currentPage: 1,
  pageSize: 50,
  selectedGPO: null,
  selectedIndex: -1,
  scrollTop: 0,
};

const initialGPOSettingsState: GPOSettingsState = {
  search: '',
  scopeFilter: 'all',
  categoryFilter: 'all',
  currentPage: 1,
  pageSize: 100,
  sortField: 'severity',
  sortDirection: 'desc',
  selectedIndex: null,
  showExportDropdown: false,
  scrollTop: 0,
};

/**
 * Custom hook for GPO-related state management
 *
 * Consolidates GPO state from App.tsx:
 * - GPO list state (search, filter, sort, pagination, selection)
 * - GPO settings state (search, filters, sort, pagination, selection)
 * - Scroll position persistence with localStorage
 */
export function useGPOState(): UseGPOState {
  // Core GPO data
  const [GPOReport, setGPOReport] = useState<GPOReport | null>(null);

  // GPO List state (GPO Details view)
  const [gpoList, setGpoList] = useState<GPOListState>(initialGPOListState);

  // GPO Settings state (GPO Results view)
  const [gpoSettings, setGpoSettings] = useState<GPOSettingsState>(initialGPOSettingsState);

  // Initialize scroll positions from localStorage
  useEffect(() => {
    const storedGpoListScroll = getStoredPct('scroll:gpo-list', 0);
    const storedGpoSettingsScroll = getStoredPct('scroll:gpo-settings', 0);
    setGpoList((prev) => ({ ...prev, scrollTop: storedGpoListScroll }));
    setGpoSettings((prev) => ({ ...prev, scrollTop: storedGpoSettingsScroll }));
  }, []);

  // Save GPO list scroll position to localStorage
  useEffect(() => {
    setStoredPct('scroll:gpo-list', gpoList.scrollTop);
  }, [gpoList.scrollTop]);

  // Save GPO settings scroll position to localStorage
  useEffect(() => {
    setStoredPct('scroll:gpo-settings', gpoSettings.scrollTop);
  }, [gpoSettings.scrollTop]);

  // GPO List setters
  const setGpoSearch = useCallback((search: string) => {
    setGpoList((prev) => ({ ...prev, search }));
  }, []);

  const setGpoLinkedFilter = useCallback((linkedFilter: string) => {
    setGpoList((prev) => ({ ...prev, linkedFilter }));
  }, []);

  const setGpoSortField = useCallback((sortField: GPODetailsSortField) => {
    setGpoList((prev) => ({ ...prev, sortField }));
  }, []);

  const setGpoSortDirection = useCallback((sortDirection: 'asc' | 'desc') => {
    setGpoList((prev) => ({ ...prev, sortDirection }));
  }, []);

  const setGpoCurrentPage = useCallback((currentPage: number) => {
    setGpoList((prev) => ({ ...prev, currentPage }));
  }, []);

  const setGpoPageSize = useCallback((pageSize: number) => {
    setGpoList((prev) => ({ ...prev, pageSize }));
  }, []);

  const setSelectedGPO = useCallback((selectedGPO: Gpo | null) => {
    setGpoList((prev) => ({ ...prev, selectedGPO }));
  }, []);

  const setSelectedGPOIndex = useCallback((selectedIndex: number) => {
    setGpoList((prev) => ({ ...prev, selectedIndex }));
  }, []);

  const setGpoListScrollTop = useCallback((scrollTop: number) => {
    setGpoList((prev) => ({ ...prev, scrollTop }));
  }, []);

  // GPO Settings setters
  const setGpoSettingsSearch = useCallback((search: string) => {
    setGpoSettings((prev) => ({ ...prev, search }));
  }, []);

  const setGpoSettingsScopeFilter = useCallback((scopeFilter: string) => {
    setGpoSettings((prev) => ({ ...prev, scopeFilter }));
  }, []);

  const setGpoSettingsCategoryFilter = useCallback((categoryFilter: string) => {
    setGpoSettings((prev) => ({ ...prev, categoryFilter }));
  }, []);

  const setGpoSettingsCurrentPage = useCallback((currentPage: number) => {
    setGpoSettings((prev) => ({ ...prev, currentPage }));
  }, []);

  const setGpoSettingsPageSize = useCallback((pageSize: number) => {
    setGpoSettings((prev) => ({ ...prev, pageSize }));
  }, []);

  const setGpoSettingsSortField = useCallback((sortField: GPOResultsSortField) => {
    setGpoSettings((prev) => ({ ...prev, sortField }));
  }, []);

  const setGpoSettingsSortDirection = useCallback((sortDirection: 'asc' | 'desc') => {
    setGpoSettings((prev) => ({ ...prev, sortDirection }));
  }, []);

  const setGpoSettingsSelectedIndex = useCallback((selectedIndex: number | null) => {
    setGpoSettings((prev) => ({ ...prev, selectedIndex }));
  }, []);

  const setGpoSettingsShowExportDropdown = useCallback((showExportDropdown: boolean) => {
    setGpoSettings((prev) => ({ ...prev, showExportDropdown }));
  }, []);

  const setGpoSettingsScrollTop = useCallback((scrollTop: number) => {
    setGpoSettings((prev) => ({ ...prev, scrollTop }));
  }, []);

  // Clear all GPO state
  const clearGPOState = useCallback(() => {
    setGPOReport(null);
    setGpoList(initialGPOListState);
    setGpoSettings(initialGPOSettingsState);
  }, []);

  return {
    // Core GPO data
    GPOReport,
    setGPOReport,

    // GPO List state
    gpoList,
    setGpoSearch,
    setGpoLinkedFilter,
    setGpoSortField,
    setGpoSortDirection,
    setGpoCurrentPage,
    setGpoPageSize,
    setSelectedGPO,
    setSelectedGPOIndex,
    setGpoListScrollTop,

    // GPO Settings state
    gpoSettings,
    setGpoSettingsSearch,
    setGpoSettingsScopeFilter,
    setGpoSettingsCategoryFilter,
    setGpoSettingsCurrentPage,
    setGpoSettingsPageSize,
    setGpoSettingsSortField,
    setGpoSettingsSortDirection,
    setGpoSettingsSelectedIndex,
    setGpoSettingsShowExportDropdown,
    setGpoSettingsScrollTop,

    // Actions
    clearGPOState,
  };
}
