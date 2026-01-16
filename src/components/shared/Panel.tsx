import React, { ReactNode } from 'react';

type PanelPosition = 'left' | 'center' | 'right';

interface PanelProps {
  position: PanelPosition;
  width?: number;
  minimized?: boolean;
  children: ReactNode;
  className?: string;
}

/**
 * Shared Panel component for individual panel in three-panel layouts.
 *
 * Used by PanelLayout to render left, center, and right panels.
 * Handles:
 * - Width sizing (px for left/right, flex for center)
 * - Minimized state for left panel
 * - Consistent panel structure
 */
export const Panel: React.FC<PanelProps> = ({
  position,
  width,
  minimized = false,
  children,
  className = '',
}) => {
  const getPositionClass = (): string => {
    switch (position) {
      case 'left':
        return 'left-panel';
      case 'center':
        return 'center-panel';
      case 'right':
        return 'right-panel';
      default:
        return '';
    }
  };

  const positionClass = getPositionClass();
  const minimizedClass = minimized ? 'minimized' : '';
  const combinedClassName = [positionClass, minimizedClass, className]
    .filter(Boolean)
    .join(' ');

  // Calculate style based on position
  const style: React.CSSProperties = {};
  if (position === 'left' || position === 'right') {
    style.width = width ? `${width}px` : undefined;
    style.flexShrink = 0;
  } else {
    // Center panel fills remaining space
    style.flex = 1;
  }

  return (
    <div className={combinedClassName} style={style}>
      {children}
    </div>
  );
};
