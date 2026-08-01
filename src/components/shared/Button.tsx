import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'pagination' | 'action' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps {
  variant?: ButtonVariant;
  size?: ButtonSize;
  disabled?: boolean;
  active?: boolean;
  onClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  children: React.ReactNode;
  className?: string;
  title?: string;
  type?: 'button' | 'submit' | 'reset';
}

/**
 * Shared Button component for consistent styling across all views.
 *
 * Variants:
 * - primary: Accent-filled action buttons
 * - secondary: Neutral bordered buttons
 * - ghost: Minimal inline actions
 * - pagination: Page controls with active state
 * - action: Standard toolbar actions
 * - danger: Destructive hover treatment
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  size = 'md',
  disabled = false,
  active = false,
  onClick,
  children,
  className = '',
  title,
  type = 'button',
}) => {
  const classes: string[] = ['btn'];

  switch (variant) {
    case 'primary':
      classes.push('btn-primary');
      break;
    case 'ghost':
      classes.push('ghost-button');
      break;
    case 'pagination':
      classes.push('pagination-button');
      break;
    case 'action':
      classes.push('action-button');
      break;
    case 'danger':
      classes.push('btn-danger', 'action-button');
      break;
    case 'secondary':
    default:
      break;
  }

  if (size === 'sm') classes.push('btn-sm', 'button-sm');
  if (size === 'lg') classes.push('large-button');
  if (active) classes.push('active');
  if (className) classes.push(className);

  return (
    <button
      type={type}
      className={classes.filter(Boolean).join(' ')}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
};
