import React from 'react';

type View = 'dashboard' | 'file-results' | 'share-results' | 'GPO-results';

interface NavigationProps {
  currentView: View;
  onViewChange: (view: View) => void;
  hasShareData: boolean;
  hasGPOData: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ currentView, onViewChange, hasShareData, hasGPOData }) => {
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
            </button>
            <button
              className={`nav-tab ${currentView === 'share-results' ? 'active' : ''}`}
              onClick={() => onViewChange('share-results')}
            >
              <i className="fas fa-share-alt"></i>
              <span>Share Results</span>
            </button>
          </>
        )}
        {hasGPOData && !hasShareData && (
          <button
            className={`nav-tab ${currentView === 'GPO-results' ? 'active' : ''}`}
            onClick={() => onViewChange('GPO-results')}
          >
            <i className="fas fa-shield-alt"></i>
            <span>GPO Results</span>
          </button>
        )}
      </div>
    </nav>
  );
}; 