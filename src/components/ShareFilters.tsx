import React from 'react';
import { Button } from './shared';

interface ShareFiltersProps {
  isMinimized: boolean;
  // Access filters
  showWritableOnly: boolean;
  onShowWritableOnlyChange: (value: boolean) => void;
  showReadableOnly: boolean;
  onShowReadableOnlyChange: (value: boolean) => void;
  showModifiableOnly: boolean;
  onShowModifiableOnlyChange: (value: boolean) => void;
}

export const ShareFilters: React.FC<ShareFiltersProps> = ({
  isMinimized,
  showWritableOnly,
  onShowWritableOnlyChange,
  showReadableOnly,
  onShowReadableOnlyChange,
  showModifiableOnly,
  onShowModifiableOnlyChange,
}) => {
  return (
    <div className="filters-container">
      <div className="filter-section">
        <label>Access Filters</label>
        <div className="credentials-filter">
          <Button
            className={`credentials-filter-button ${showWritableOnly ? 'active' : ''}`}
            active={showWritableOnly}
            onClick={() => onShowWritableOnlyChange(!showWritableOnly)}
          >
            <i className="fas fa-edit"></i>
            {!isMinimized && <span>Writable Only</span>}
          </Button>
          <Button
            className={`credentials-filter-button ${showReadableOnly ? 'active' : ''}`}
            active={showReadableOnly}
            onClick={() => onShowReadableOnlyChange(!showReadableOnly)}
          >
            <i className="fas fa-eye"></i>
            {!isMinimized && <span>Readable Only</span>}
          </Button>
          <Button
            className={`credentials-filter-button ${showModifiableOnly ? 'active' : ''}`}
            active={showModifiableOnly}
            onClick={() => onShowModifiableOnlyChange(!showModifiableOnly)}
          >
            <i className="fas fa-pen"></i>
            {!isMinimized && <span>Modifiable Only</span>}
          </Button>
        </div>
      </div>
    </div>
  );
};
