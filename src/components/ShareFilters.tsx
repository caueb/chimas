import React from 'react';

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
        <div className="rating-filters access-filters">
          <div
            className={`rating-filter-item access-filter-item ${showWritableOnly ? 'selected' : ''}`}
            onClick={() => onShowWritableOnlyChange(!showWritableOnly)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onShowWritableOnlyChange(!showWritableOnly);
              }
            }}
            title="Writable"
          >
            <div className="rating-filter-count">
              <i className="fas fa-edit" aria-hidden="true"></i>
            </div>
            {!isMinimized && <div className="rating-filter-label">Writable</div>}
          </div>
          <div
            className={`rating-filter-item access-filter-item ${showReadableOnly ? 'selected' : ''}`}
            onClick={() => onShowReadableOnlyChange(!showReadableOnly)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onShowReadableOnlyChange(!showReadableOnly);
              }
            }}
            title="Readable"
          >
            <div className="rating-filter-count">
              <i className="fas fa-eye" aria-hidden="true"></i>
            </div>
            {!isMinimized && <div className="rating-filter-label">Readable</div>}
          </div>
          <div
            className={`rating-filter-item access-filter-item ${showModifiableOnly ? 'selected' : ''}`}
            onClick={() => onShowModifiableOnlyChange(!showModifiableOnly)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onShowModifiableOnlyChange(!showModifiableOnly);
              }
            }}
            title="Modifiable"
          >
            <div className="rating-filter-count">
              <i className="fas fa-pen" aria-hidden="true"></i>
            </div>
            {!isMinimized && <div className="rating-filter-label">Modifiable</div>}
          </div>
        </div>
      </div>
    </div>
  );
};
