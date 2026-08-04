import React, { useState } from 'react';
import { SortField, SortDirection, CustomFilter } from '../types';
import { Button } from './shared';

interface FiltersProps {
  ratingFilter: string[];
  searchFilter: string;
  fileExtensionFilter: string[];
  sortField: SortField;
  sortDirection: SortDirection;
  customFilters: CustomFilter[];
  onRatingFilterChange: (value: string[]) => void;
  onSearchFilterChange: (value: string) => void;
  onFileExtensionFilterChange: (value: string[]) => void;
  onSortFieldChange: (field: SortField) => void;
  onSortDirectionChange: (direction: SortDirection) => void;
  onCustomFiltersChange: (filters: CustomFilter[]) => void;
  stats: {
    total: number;
    red: number;
    yellow: number;
    green: number;
    black: number;
  };
  isMinimized?: boolean;
}

export const Filters: React.FC<FiltersProps> = ({
  ratingFilter,
  fileExtensionFilter,
  customFilters,
  onRatingFilterChange,
  onFileExtensionFilterChange,
  onCustomFiltersChange,
  stats,
  isMinimized = false
}) => {
  const [customFilterText, setCustomFilterText] = useState('');
  const [fileExtensionInput, setFileExtensionInput] = useState('');

  const handleRatingClick = (rating: string) => {
    if (rating === 'all') {
      onRatingFilterChange(['all']);
    } else {
      const newFilters = ratingFilter.includes('all')
        ? [rating]
        : ratingFilter.includes(rating)
          ? ratingFilter.filter(r => r !== rating)
          : [...ratingFilter, rating];

      onRatingFilterChange(newFilters.length === 0 ? ['all'] : newFilters);
    }
  };

  const isSelected = (rating: string) => {
    return ratingFilter.includes(rating);
  };

  const handleAddCustomFilter = () => {
    const trimmedText = customFilterText.trim();
    if (trimmedText && !customFilters.some(filter => filter.text.toLowerCase() === trimmedText.toLowerCase())) {
      const newFilter: CustomFilter = {
        id: Date.now().toString(),
        text: trimmedText
      };
      onCustomFiltersChange([...customFilters, newFilter]);
      setCustomFilterText('');
    }
  };

  const handleRemoveCustomFilter = (id: string) => {
    onCustomFiltersChange(customFilters.filter(filter => filter.id !== id));
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddCustomFilter();
    }
  };

  const handleAddFileExtensionFilter = () => {
    const trimmedExtension = fileExtensionInput.trim();
    if (trimmedExtension) {
      // Remove leading dot if present
      const cleanExtension = trimmedExtension.startsWith('.')
        ? trimmedExtension.slice(1)
        : trimmedExtension;

      if (!fileExtensionFilter.includes(cleanExtension.toLowerCase())) {
        onFileExtensionFilterChange([...fileExtensionFilter, cleanExtension.toLowerCase()]);
        setFileExtensionInput('');
      }
    }
  };

  const handleRemoveFileExtensionFilter = (extension: string) => {
    onFileExtensionFilterChange(fileExtensionFilter.filter(ext => ext !== extension));
  };

  const handleFileExtensionKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleAddFileExtensionFilter();
    }
  };

  return (
    <div className="filters-container">
      <div className="filter-section">
        <label>Quick Filters</label>
        <div className="rating-filters">
          <div
            className={`rating-filter-item ${isSelected('all') ? 'selected' : ''}`}
            onClick={() => handleRatingClick('all')}
          >
            <div className="rating-filter-count">{isMinimized ? 'T' : stats.total}</div>
            <div className="rating-filter-label">Total Files</div>
          </div>
          <div
            className={`rating-filter-item black ${isSelected('black') ? 'selected' : ''}`}
            onClick={() => handleRatingClick('black')}
          >
            <div className="rating-filter-count">{isMinimized ? 'B' : stats.black}</div>
            <div className="rating-filter-label">Black</div>
          </div>
          <div
            className={`rating-filter-item red ${isSelected('red') ? 'selected' : ''}`}
            onClick={() => handleRatingClick('red')}
          >
            <div className="rating-filter-count">{isMinimized ? 'R' : stats.red}</div>
            <div className="rating-filter-label">Red</div>
          </div>
          <div
            className={`rating-filter-item yellow ${isSelected('yellow') ? 'selected' : ''}`}
            onClick={() => handleRatingClick('yellow')}
          >
            <div className="rating-filter-count">{isMinimized ? 'Y' : stats.yellow}</div>
            <div className="rating-filter-label">Yellow</div>
          </div>
          <div
            className={`rating-filter-item green ${isSelected('green') ? 'selected' : ''}`}
            onClick={() => handleRatingClick('green')}
          >
            <div className="rating-filter-count">{isMinimized ? 'G' : stats.green}</div>
            <div className="rating-filter-label">Green</div>
          </div>
        </div>
      </div>

      <div className="filter-section filter-card">
        <label>File Extension Filter</label>
        <div className="file-extension-filter-input">
          <input
            type="text"
            placeholder="Enter file extension to show (e.g., txt, pdf, docx)..."
            value={fileExtensionInput}
            onChange={(e) => setFileExtensionInput(e.target.value)}
            onKeyPress={handleFileExtensionKeyPress}
          />
        </div>
        {fileExtensionFilter.length > 0 && !isMinimized && (
          <div className="custom-filters-list">
            {fileExtensionFilter.map(extension => (
              <div key={extension} className="custom-filter-item">
                <span className="filter-text">.{extension}</span>
                <Button
                  variant="ghost"
                  className="remove-filter-button"
                  onClick={() => handleRemoveFileExtensionFilter(extension)}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="filter-section filter-card">
        <label>Filter out</label>
        <div className="custom-filter-input">
          <input
            type="text"
            placeholder="Enter text to filter out..."
            value={customFilterText}
            onChange={(e) => setCustomFilterText(e.target.value)}
            onKeyPress={handleKeyPress}
          />
        </div>
        {customFilters.length > 0 && (
          <div className="custom-filters-list">
            {customFilters.map(filter => (
              <div key={filter.id} className="custom-filter-item">
                <span className="filter-text">{filter.text}</span>
                <Button
                  variant="ghost"
                  className="remove-filter-button"
                  onClick={() => handleRemoveCustomFilter(filter.id)}
                >
                  ×
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
