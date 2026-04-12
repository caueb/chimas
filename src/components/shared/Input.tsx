import React from 'react';

interface InputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearable?: boolean;
  icon?: 'search' | 'none';
  disabled?: boolean;
  className?: string;
  id?: string;
  onKeyPress?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}

/**
 * Shared Input component for consistent styling across all views.
 *
 * Uses the search-input-wrapper CSS classes for consistent appearance.
 * - Optional search icon (default) via Font Awesome
 * - Optional clear button when clearable=true and has value
 * - Consistent border, padding, and focus states
 */
export const Input: React.FC<InputProps> = ({
  value,
  onChange,
  placeholder = '',
  clearable = true,
  icon = 'search',
  disabled = false,
  className = '',
  id,
  onKeyPress,
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onChange(e.target.value);
  };

  const handleClear = () => {
    onChange('');
  };

  // Wrapper class controls whether the search icon pseudo-element shows
  const wrapperClass = icon === 'search' ? 'search-input-wrapper' : 'search-input-wrapper no-icon';

  return (
    <div className={`search-container ${className}`.trim()}>
      <div className={wrapperClass}>
        <input
          id={id}
          type="text"
          value={value}
          onChange={handleChange}
          placeholder={placeholder}
          disabled={disabled}
          onKeyPress={onKeyPress}
        />
        {clearable && value && (
          <button
            className="search-clear-button"
            onClick={handleClear}
            type="button"
            aria-label="Clear input"
          >
            ×
          </button>
        )}
      </div>
    </div>
  );
};
