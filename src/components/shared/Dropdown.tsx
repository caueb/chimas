import React, { useEffect, useRef, useState } from 'react';

export interface DropdownOption {
  value: string;
  label: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/**
 * Shared Dropdown component for consistent styling across all views.
 *
 * Uses the unified-dropdown CSS classes for consistent appearance.
 * - Single-select dropdown (closes on select)
 * - Click-outside to close
 * - Keyboard accessible
 */
export const Dropdown: React.FC<DropdownProps> = ({
  options,
  value,
  onChange,
  placeholder = 'Select...',
  disabled = false,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Handle click outside to close dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Handle keyboard navigation
  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;

    switch (event.key) {
      case 'Enter':
      case ' ':
        event.preventDefault();
        setIsOpen(!isOpen);
        break;
      case 'Escape':
        setIsOpen(false);
        break;
      case 'ArrowDown':
        if (!isOpen) {
          event.preventDefault();
          setIsOpen(true);
        }
        break;
    }
  };

  const handleSelect = (optionValue: string) => {
    onChange(optionValue);
    setIsOpen(false);
  };

  const selectedOption = options.find(opt => opt.value === value);
  const displayLabel = selectedOption ? selectedOption.label : placeholder;

  return (
    <div
      ref={dropdownRef}
      className={`unified-dropdown ${className}`.trim()}
    >
      <button
        type="button"
        className="unified-dropdown-button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        onKeyDown={handleKeyDown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <span>{displayLabel}</span>
        <span className="unified-dropdown-arrow">
          <i className="fas fa-chevron-down"></i>
        </span>
      </button>
      {isOpen && (
        <div className="unified-dropdown-menu show" role="listbox">
          {options.map((option) => (
            <div key={option.value} className="unified-dropdown-item">
              <button
                type="button"
                onClick={() => handleSelect(option.value)}
                className={value === option.value ? 'selected' : ''}
                role="option"
                aria-selected={value === option.value}
              >
                {option.label}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
