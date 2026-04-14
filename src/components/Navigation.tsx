import React from 'react';
import { View } from '../utils/constants';

interface NavigationProps {
  currentView: View;
  onViewChange: (view: View) => void;
  hasShareData: boolean;
  hasGPOData: boolean;
  hasBloodHoundData?: boolean;
  counts?: {
    files?: number;
    filteredFiles?: number;
    shares?: number;
    gpoSettings?: number;
    gpoCount?: number;
  };
}

// hasBloodHoundData is accepted but not rendered in nav (indicator is in the header)

const formatCount = (count: number): string => {
  if (count >= 1000000) {
    return `${(count / 1000000).toFixed(1)}M`;
  }
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1)}K`;
  }
  return count.toString();
};

export const Navigation: React.FC<NavigationProps> = ({ currentView, onViewChange, hasShareData, hasGPOData, hasBloodHoundData, counts }) => {
  return (
    <nav className="navigation">
      <div className="nav-tabs">
        <button
          className={`nav-tab ${currentView === 'dashboard' ? 'active' : ''}`}
          onClick={() => onViewChange('dashboard')}
        >
          <i className="fas fa-chart-bar"></i>
          <span>Dashboard</span>
        </button>
        {hasShareData && !hasGPOData && (
          <>
            <button
              className={`nav-tab ${currentView === 'file-results' ? 'active' : ''}`}
              onClick={() => onViewChange('file-results')}
            >
              <i className="fas fa-file-alt"></i>
              <span>File Results</span>
              {counts?.files !== undefined && counts.files > 0 && (
                <span className="nav-badge">
                  {counts.filteredFiles !== undefined && counts.filteredFiles !== counts.files
                    ? `${formatCount(counts.filteredFiles)}/${formatCount(counts.files)}`
                    : formatCount(counts.files)
                  }
                </span>
              )}
            </button>
            <button
              className={`nav-tab ${currentView === 'share-results' ? 'active' : ''}`}
              onClick={() => onViewChange('share-results')}
            >
              <i className="fas fa-share-alt"></i>
              <span>Share Results</span>
              {counts?.shares !== undefined && counts.shares > 0 && (
                <span className="nav-badge">{formatCount(counts.shares)}</span>
              )}
            </button>
          </>
        )}
        {hasGPOData && !hasShareData && (
          <>
            <button
              className={`nav-tab ${currentView === 'GPO-details' ? 'active' : ''}`}
              onClick={() => onViewChange('GPO-details')}
            >
              <i className="fas fa-list-alt"></i>
              <span>GPO List</span>
              {counts?.gpoCount !== undefined && counts.gpoCount > 0 && (
                <span className="nav-badge">{formatCount(counts.gpoCount)}</span>
              )}
            </button>
            <button
              className={`nav-tab ${currentView === 'GPO-results' ? 'active' : ''}`}
              onClick={() => onViewChange('GPO-results')}
            >
              <i className="fas fa-shield-alt"></i>
              <span>GPO Settings</span>
              {counts?.gpoSettings !== undefined && counts.gpoSettings > 0 && (
                <span className="nav-badge">{formatCount(counts.gpoSettings)}</span>
              )}
            </button>
            <button
              className={`nav-tab ${currentView === 'misconfigurations' ? 'active' : ''}`}
              onClick={() => onViewChange('misconfigurations')}
            >
              <i className="fas fa-exclamation-triangle"></i>
              <span>Misconfigurations</span>
            </button>
          </>
        )}
      </div>
    </nav>
  );
}; 