import React, { useRef, useEffect, ReactNode } from 'react';

export type SortDirection = 'asc' | 'desc';

export interface TableColumn<T, K extends string = string> {
  /** Unique key for the column */
  key: K;
  /** Column header text */
  header: string;
  /** Whether column is sortable */
  sortable?: boolean;
  /** CSS class for the column header */
  headerClassName?: string;
  /** CSS class for the column cells */
  cellClassName?: string;
  /** Custom render function for cell content */
  render?: (item: T, index: number) => ReactNode;
  /** Simple accessor for cell value (used if render not provided) */
  accessor?: (item: T) => ReactNode;
}

interface TableProps<T, K extends string = string> {
  columns: TableColumn<T, K>[];
  data: T[];
  sortField?: K;
  sortDirection?: SortDirection;
  onSort?: (field: K) => void;
  selectedItem?: T | null;
  onSelectItem?: (item: T, index: number) => void;
  getRowKey: (item: T, index: number) => string;
  getRowClassName?: (item: T, index: number) => string;
  emptyMessage?: ReactNode;
  className?: string;
}

/**
 * Shared Table component for consistent table rendering across all views.
 *
 * Extracted from ResultsTable.tsx patterns.
 * Features:
 * - Sortable columns with sort indicators
 * - Row selection with keyboard navigation
 * - Custom cell rendering
 * - Empty state handling
 * - Consistent styling via CSS classes
 */
export function Table<T, K extends string = string>({
  columns,
  data,
  sortField,
  sortDirection,
  onSort,
  selectedItem,
  onSelectItem,
  getRowKey,
  getRowClassName,
  emptyMessage = 'No results found',
  className = '',
}: TableProps<T, K>) {
  const tableRef = useRef<HTMLTableElement>(null);

  // Keyboard navigation
  useEffect(() => {
    if (!selectedItem || !onSelectItem || data.length === 0) return;

    const currentIndex = data.indexOf(selectedItem);
    if (currentIndex === -1) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      let newIndex = currentIndex;

      switch (event.key) {
        case 'ArrowDown':
          event.preventDefault();
          newIndex = Math.min(currentIndex + 1, data.length - 1);
          break;
        case 'ArrowUp':
          event.preventDefault();
          newIndex = Math.max(currentIndex - 1, 0);
          break;
        default:
          return;
      }

      if (newIndex !== currentIndex) {
        onSelectItem(data[newIndex], newIndex);

        // Scroll the new row into view
        setTimeout(() => {
          const rows = tableRef.current?.querySelectorAll('tbody tr');
          if (rows && rows[newIndex]) {
            rows[newIndex].scrollIntoView({
              behavior: 'smooth',
              block: 'nearest',
            });
          }
        }, 0);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedItem, data, onSelectItem]);

  const getSortIcon = (columnKey: K): string => {
    if (sortField !== columnKey) return '↕';
    return sortDirection === 'asc' ? '↑' : '↓';
  };

  const handleHeaderClick = (column: TableColumn<T, K>) => {
    if (column.sortable && onSort) {
      onSort(column.key);
    }
  };

  const isSelected = (item: T): boolean => {
    return selectedItem === item;
  };

  if (data.length === 0) {
    return (
      <div className="no-data">
        {typeof emptyMessage === 'string' ? (
          <>
            <h3>No results found</h3>
            <p>{emptyMessage}</p>
          </>
        ) : (
          emptyMessage
        )}
      </div>
    );
  }

  return (
    <div className={`table-container ${className}`}>
      <table className="table" ref={tableRef}>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.key}
                className={column.headerClassName || ''}
                onClick={() => handleHeaderClick(column)}
                style={{ cursor: column.sortable ? 'pointer' : 'default' }}
              >
                {column.header}
                {column.sortable && onSort && (
                  <span
                    className={`sort-icon ${sortField === column.key ? 'active' : ''}`}
                  >
                    {getSortIcon(column.key)}
                  </span>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((item, index) => {
            const rowKey = getRowKey(item, index);
            const rowClassName = getRowClassName ? getRowClassName(item, index) : '';
            const selectedClass = isSelected(item) ? 'selected' : '';

            return (
              <tr
                key={rowKey}
                onClick={() => onSelectItem?.(item, index)}
                className={`${selectedClass} ${rowClassName}`.trim()}
                style={{ cursor: onSelectItem ? 'pointer' : 'default' }}
              >
                {columns.map((column) => (
                  <td key={column.key} className={column.cellClassName || ''}>
                    {column.render
                      ? column.render(item, index)
                      : column.accessor
                        ? column.accessor(item)
                        : null}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
