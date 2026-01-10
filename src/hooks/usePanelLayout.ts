import { useState, useRef, useEffect, useCallback } from 'react';
import { LAYOUT } from '../utils/constants';
import { getStoredPct, setStoredPct } from './useLocalStorage';

interface PanelLayoutConfig {
  /** Prefix for localStorage keys (e.g., 'layout' results in 'layout:leftPct') */
  storageKeyPrefix: string;
  /** Initial left panel width in pixels (default: 300) */
  initialLeftWidth?: number;
  /** Initial right panel width in pixels (default: 400) */
  initialRightWidth?: number;
}

interface PanelLayoutState {
  leftPanelWidthPx: number;
  rightPanelWidthPx: number;
  isLeftPanelMinimized: boolean;
  showRightPanel: boolean;
  draggingSide: 'left' | 'right' | null;
}

interface PanelLayoutActions {
  setLeftPanelWidthPx: (width: number) => void;
  setRightPanelWidthPx: (width: number) => void;
  setShowRightPanel: (show: boolean) => void;
  toggleLeftPanel: () => void;
  startDragging: (side: 'left' | 'right') => void;
  stopDragging: () => void;
}

/**
 * Custom hook for managing resizable panel layouts
 *
 * Consolidates panel resize logic from:
 * - App.tsx (~150 lines)
 * - GPODetails.tsx
 * - GPOResults.tsx
 *
 * Features:
 * - Drag-to-resize for left and right panels
 * - Minimize/restore left panel
 * - Constraints to maintain minimum panel sizes
 * - localStorage persistence
 * - Window resize handling
 */
export function usePanelLayout(
  config: PanelLayoutConfig
): [PanelLayoutState, PanelLayoutActions] {
  const {
    storageKeyPrefix,
    initialLeftWidth = LAYOUT.DEFAULT_LEFT_PANEL,
    initialRightWidth = LAYOUT.DEFAULT_RIGHT_PANEL,
  } = config;

  const [leftPanelWidthPx, setLeftPanelWidthPx] = useState(initialLeftWidth);
  const [rightPanelWidthPx, setRightPanelWidthPx] = useState(initialRightWidth);
  const [isLeftPanelMinimized, setIsLeftPanelMinimized] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [draggingSide, setDraggingSide] = useState<'left' | 'right' | null>(
    null
  );

  const previousLeftWidthRef = useRef(initialLeftWidth);
  const windowWidthRef = useRef(
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );

  const leftKey = `${storageKeyPrefix}:leftPct`;
  const rightKey = `${storageKeyPrefix}:rightPct`;

  // Initialize from localStorage
  useEffect(() => {
    const ww = window.innerWidth;
    windowWidthRef.current = ww;

    const storedLeftPct = getStoredPct(leftKey, initialLeftWidth / ww);
    const storedRightPct = getStoredPct(rightKey, initialRightWidth / ww);

    const computedRight = Math.round(storedRightPct * ww);
    const maxLeft = Math.max(
      LAYOUT.MIN_LEFT_PANEL,
      ww - (showRightPanel ? computedRight : 0) - LAYOUT.MIN_CENTER_PANEL
    );
    const newLeft = Math.max(
      LAYOUT.MIN_LEFT_PANEL,
      Math.min(Math.round(storedLeftPct * ww), maxLeft)
    );
    const maxRight = Math.max(
      LAYOUT.MIN_RIGHT_PANEL,
      ww - newLeft - LAYOUT.MIN_CENTER_PANEL
    );
    const newRight = Math.max(
      LAYOUT.MIN_RIGHT_PANEL,
      Math.min(computedRight, maxRight)
    );

    setLeftPanelWidthPx(newLeft);
    setRightPanelWidthPx(newRight);
    previousLeftWidthRef.current = Math.max(
      LAYOUT.MIN_LEFT_PANEL,
      Math.round(storedLeftPct * ww)
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist left panel width to localStorage
  useEffect(() => {
    const ww = windowWidthRef.current || window.innerWidth;
    if (ww > 0 && !isLeftPanelMinimized) {
      setStoredPct(leftKey, leftPanelWidthPx / ww);
    }
  }, [leftPanelWidthPx, leftKey, isLeftPanelMinimized]);

  // Persist right panel width to localStorage
  useEffect(() => {
    const ww = windowWidthRef.current || window.innerWidth;
    if (ww > 0) {
      setStoredPct(rightKey, rightPanelWidthPx / ww);
    }
  }, [rightPanelWidthPx, rightKey]);

  // Window resize handler
  useEffect(() => {
    const onResize = () => {
      const ww = window.innerWidth;
      const leftPct = leftPanelWidthPx / windowWidthRef.current;
      const rightPct = rightPanelWidthPx / windowWidthRef.current;
      windowWidthRef.current = ww;

      const computedLeft = Math.round(leftPct * ww);
      const computedRight = Math.round(rightPct * ww);
      const maxLeft = Math.max(
        LAYOUT.MIN_LEFT_PANEL,
        ww - (showRightPanel ? computedRight : 0) - LAYOUT.MIN_CENTER_PANEL
      );

      setLeftPanelWidthPx(
        Math.max(LAYOUT.MIN_LEFT_PANEL, Math.min(computedLeft, maxLeft))
      );

      if (showRightPanel) {
        const maxRight = Math.max(
          LAYOUT.MIN_RIGHT_PANEL,
          ww - leftPanelWidthPx - LAYOUT.MIN_CENTER_PANEL
        );
        setRightPanelWidthPx(
          Math.max(LAYOUT.MIN_RIGHT_PANEL, Math.min(computedRight, maxRight))
        );
      }
    };

    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [leftPanelWidthPx, rightPanelWidthPx, showRightPanel]);

  // Clamp sizes when right panel visibility changes
  useEffect(() => {
    const ww = window.innerWidth;
    if (showRightPanel) {
      const maxLeft = Math.max(
        LAYOUT.MIN_LEFT_PANEL,
        ww - rightPanelWidthPx - LAYOUT.MIN_CENTER_PANEL
      );
      setLeftPanelWidthPx((prev) =>
        Math.max(LAYOUT.MIN_LEFT_PANEL, Math.min(prev, maxLeft))
      );
      const maxRight = Math.max(
        LAYOUT.MIN_RIGHT_PANEL,
        ww -
          (isLeftPanelMinimized
            ? LAYOUT.MINIMIZED_PANEL
            : leftPanelWidthPx) -
          LAYOUT.MIN_CENTER_PANEL
      );
      setRightPanelWidthPx((prev) =>
        Math.max(LAYOUT.MIN_RIGHT_PANEL, Math.min(prev, maxRight))
      );
    } else {
      const maxLeft = Math.max(
        LAYOUT.MIN_LEFT_PANEL,
        ww - LAYOUT.MIN_CENTER_PANEL
      );
      setLeftPanelWidthPx((prev) =>
        Math.max(LAYOUT.MIN_LEFT_PANEL, Math.min(prev, maxLeft))
      );
    }
  }, [showRightPanel, isLeftPanelMinimized, leftPanelWidthPx, rightPanelWidthPx]);

  // Drag handling
  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!draggingSide) return;
      const ww = window.innerWidth;

      if (draggingSide === 'left') {
        if (isLeftPanelMinimized) return;
        let newLeft = e.clientX;
        const maxLeft =
          ww - (showRightPanel ? rightPanelWidthPx : 0) - LAYOUT.MIN_CENTER_PANEL;
        newLeft = Math.max(LAYOUT.MIN_LEFT_PANEL, Math.min(newLeft, maxLeft));
        setLeftPanelWidthPx(newLeft);
        previousLeftWidthRef.current = newLeft;
      } else if (draggingSide === 'right') {
        if (!showRightPanel) return;
        let newRight = ww - e.clientX;
        const maxRight =
          ww -
          (isLeftPanelMinimized ? LAYOUT.MINIMIZED_PANEL : leftPanelWidthPx) -
          LAYOUT.MIN_CENTER_PANEL;
        newRight = Math.max(LAYOUT.MIN_RIGHT_PANEL, Math.min(newRight, maxRight));
        setRightPanelWidthPx(newRight);
      }
    };

    const onMouseUp = () => {
      if (draggingSide) setDraggingSide(null);
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
  }, [
    draggingSide,
    isLeftPanelMinimized,
    leftPanelWidthPx,
    rightPanelWidthPx,
    showRightPanel,
  ]);

  // Toggle left panel (minimize/restore)
  const toggleLeftPanel = useCallback(() => {
    setIsLeftPanelMinimized((prev) => {
      const next = !prev;
      if (next) {
        // Minimizing: remember current width
        previousLeftWidthRef.current = leftPanelWidthPx;
        setLeftPanelWidthPx(LAYOUT.MINIMIZED_PANEL);
      } else {
        // Restoring: use previous width, respecting constraints
        const ww = window.innerWidth;
        const maxLeft =
          ww -
          (showRightPanel ? rightPanelWidthPx : 0) -
          LAYOUT.MIN_CENTER_PANEL;
        const restored = Math.max(
          LAYOUT.MIN_LEFT_PANEL,
          Math.min(
            previousLeftWidthRef.current || LAYOUT.DEFAULT_LEFT_PANEL,
            maxLeft
          )
        );
        setLeftPanelWidthPx(restored);
      }
      return next;
    });
  }, [leftPanelWidthPx, showRightPanel, rightPanelWidthPx]);

  return [
    {
      leftPanelWidthPx,
      rightPanelWidthPx,
      isLeftPanelMinimized,
      showRightPanel,
      draggingSide,
    },
    {
      setLeftPanelWidthPx,
      setRightPanelWidthPx,
      setShowRightPanel,
      toggleLeftPanel,
      startDragging: setDraggingSide,
      stopDragging: () => setDraggingSide(null),
    },
  ];
}
