import React from 'react';

type BadgeVariant = 'accent' | 'ok' | 'danger' | 'warn' | 'info';

interface BadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}

/**
 * Shared Badge for status chips and compact labels.
 */
export const Badge: React.FC<BadgeProps> = ({
  variant = 'accent',
  children,
  className = '',
}) => {
  const variantClass = variant === 'info' ? 'badge-accent' : `badge-${variant}`;
  return (
    <span className={['badge', variantClass, className].filter(Boolean).join(' ')}>
      {children}
    </span>
  );
};
