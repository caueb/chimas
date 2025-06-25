import React from 'react';

type View = 'dashboard' | 'file-results' | 'share-results';

interface NavigationProps {
  currentView: View;
  onViewChange: (view: View) => void;
  hasData: boolean;
}

export const Navigation: React.FC<NavigationProps> = ({ currentView, onViewChange, hasData }) => {
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
        <button
          className={`nav-tab ${currentView === 'file-results' ? 'active' : ''}`}
          onClick={() => onViewChange('file-results')}
          disabled={!hasData}
        >
          <i className="fas fa-file-alt"></i>
          <span>File Results</span>
        </button>
        <button
          className={`nav-tab ${currentView === 'share-results' ? 'active' : ''}`}
          onClick={() => onViewChange('share-results')}
          disabled={!hasData}
        >
          <i className="fas fa-share-alt"></i>
          <span>Share Results</span>
        </button>
      </div>
    </nav>
  );
}; 