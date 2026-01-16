import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'pagination' | 'action';
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
 * - primary: Accent-colored action buttons (export, apply)
 * - secondary: Neutral buttons with border (browse, cancel)
 * - ghost: Minimal style for inline actions (close, clear)
 * - pagination: Page navigation buttons with active state
 * - action: Standard action buttons with icon support
 *
 * Sizes:
 * - sm: Compact (pagination, inline actions)
 * - md: Default size
 * - lg: Prominent actions (file upload)
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
  const getVariantClass = (): string => {
    switch (variant) {
      case 'primary':
        return 'action-button';
      case 'secondary':
        return 'browse-button';
      case 'ghost':
        return 'ghost-button';
      case 'pagination':
        return 'pagination-button';
      case 'action':
        return 'action-button';
      default:
        return 'browse-button';
    }
  };

  const getSizeClass = (): string => {
    switch (size) {
      case 'sm':
        return 'button-sm';
      case 'lg':
        return 'large-button';
      default:
        return '';
    }
  };

  const variantClass = getVariantClass();
  const sizeClass = getSizeClass();
  const activeClass = active ? 'active' : '';
  const combinedClassName = [variantClass, sizeClass, activeClass, className]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type={type}
      className={combinedClassName}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
};
