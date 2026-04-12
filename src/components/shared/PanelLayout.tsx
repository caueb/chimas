import React, { ReactNode } from 'react';
import { usePanelLayout } from '../../hooks/usePanelLayout';
import { LAYOUT } from '../../utils/constants';
import { Panel } from './Panel';

interface PanelConfig {
  /** Content to render in the panel */
  content: ReactNode;
  /** Optional header content */
  header?: ReactNode;
  /** Initial width for left/right panels (ignored for center) */
  initialWidth?: number;
}

interface PanelLayoutProps {
  /** Prefix for localStorage keys (e.g., 'layout' results in 'layout:leftPct') */
  storageKeyPrefix: string;
  /** Left panel configuration */
  left: PanelConfig;
  /** Center panel configuration */
  center: PanelConfig;
  /** Right panel configuration (optional - only shown when showRightPanel is true) */
  right?: PanelConfig;
  /** Whether to show the right panel */
  showRightPanel?: boolean;
  /** Callback when right panel visibility changes */
  onShowRightPanelChange?: (show: boolean) => void;
  /** Whether dragging is active (for cursor styling) */
  className?: string;
}

/**
 * Shared PanelLayout component for three-panel layouts.
 *
 * Uses usePanelLayout hook internally for:
 * - Drag-to-resize for left and right panels
 * - Minimize/restore left panel
 * - Constraints to maintain minimum panel sizes
 * - localStorage persistence
 * - Window resize handling
 *
 * Renders:
 * - Left panel with resize handle
 * - Center panel (fills remaining space)
 * - Right panel with resize handle (optional)
 */
export const PanelLayout: React.FC<PanelLayoutProps> = ({
  storageKeyPrefix,
  left,
  center,
  right,
  showRightPanel: showRightPanelProp = false,
  onShowRightPanelChange,
  className = '',
}) => {
  const [state, actions] = usePanelLayout({
    storageKeyPrefix,
    initialLeftWidth: left.initialWidth || LAYOUT.DEFAULT_LEFT_PANEL,
    initialRightWidth: right?.initialWidth || LAYOUT.DEFAULT_RIGHT_PANEL,
  });

  const {
    leftPanelWidthPx,
    rightPanelWidthPx,
    isLeftPanelMinimized,
    showRightPanel: showRightPanelState,
    draggingSide,
  } = state;

  const { startDragging, toggleLeftPanel, setShowRightPanel } = actions;

  // Use prop if provided, otherwise use internal state
  const showRightPanel = onShowRightPanelChange
    ? showRightPanelProp
    : showRightPanelState;

  // Sync internal state with prop when prop changes
  React.useEffect(() => {
    if (onShowRightPanelChange && showRightPanelState !== showRightPanelProp) {
      setShowRightPanel(showRightPanelProp);
    }
  }, [showRightPanelProp, showRightPanelState, onShowRightPanelChange, setShowRightPanel]);

  const layoutClassName = [
    'panel-layout',
    draggingSide ? 'dragging' : '',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  const effectiveLeftWidth = isLeftPanelMinimized
    ? LAYOUT.MINIMIZED_PANEL
    : leftPanelWidthPx;

  return (
    <div className={layoutClassName}>
      {/* Left Panel */}
      <Panel
        position="left"
        width={effectiveLeftWidth}
        minimized={isLeftPanelMinimized}
      >
        {left.header && (
          <div className="panel-header">
            {left.header}
            <button
              className="minimize-button"
              onClick={toggleLeftPanel}
              title={isLeftPanelMinimized ? 'Expand panel' : 'Collapse panel'}
            >
              <i
                className={`fas fa-chevron-${isLeftPanelMinimized ? 'right' : 'left'}`}
              ></i>
            </button>
          </div>
        )}
        <div className="panel-content">{left.content}</div>
      </Panel>

      {/* Left Resizer */}
      <div
        className="panel-resizer left-resizer"
        onMouseDown={() => startDragging('left')}
      />

      {/* Center Panel */}
      <Panel position="center">
        {center.header && <div className="panel-header">{center.header}</div>}
        <div className="panel-content">{center.content}</div>
      </Panel>

      {/* Right Panel (conditional) */}
      {showRightPanel && right && (
        <>
          {/* Right Resizer */}
          <div
            className="panel-resizer right-resizer"
            onMouseDown={() => startDragging('right')}
          />

          <Panel position="right" width={rightPanelWidthPx}>
            {right.header && <div className="panel-header">{right.header}</div>}
            <div className="panel-content">{right.content}</div>
          </Panel>
        </>
      )}
    </div>
  );
};

// Re-export hook for direct usage when more control is needed
export { usePanelLayout } from '../../hooks/usePanelLayout';
