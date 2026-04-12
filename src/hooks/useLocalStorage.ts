import { useState, useCallback } from 'react';

/**
 * Generic hook for localStorage persistence
 * Handles JSON serialization/deserialization automatically
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = localStorage.getItem(key);
      return item ? JSON.parse(item) : initialValue;
    } catch {
      return initialValue;
    }
  });

  const setValue = useCallback(
    (value: T | ((prev: T) => T)) => {
      try {
        const valueToStore =
          value instanceof Function ? value(storedValue) : value;
        setStoredValue(valueToStore);
        localStorage.setItem(key, JSON.stringify(valueToStore));
      } catch (error) {
        console.warn(`Failed to save to localStorage key "${key}":`, error);
      }
    },
    [key, storedValue]
  );

  return [storedValue, setValue];
}

/**
 * Helper for percentage-based localStorage storage
 * Used for panel widths stored as fractions of window width
 *
 * Replaces getStoredPct/setStoredPct pattern from App.tsx:210-225
 */
export function getStoredPct(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const num = parseFloat(raw);
    return isNaN(num) ? fallback : num;
  } catch {
    return fallback;
  }
}

export function setStoredPct(key: string, value: number): void {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Silently fail - localStorage might be full or disabled
  }
}
