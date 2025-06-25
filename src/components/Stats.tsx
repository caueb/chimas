import React from 'react';
import { Stats } from '../types';

interface StatsProps {
  stats: Stats;
}

export const StatsComponent: React.FC<StatsProps> = ({ stats }) => {
  return (
    <div className="stats">
      <div className="stat-card">
        <div className="stat-number">{stats.total}</div>
        <div className="stat-label">Total Files</div>
      </div>
      <div className="stat-card">
        <div className="stat-number stat-red">{stats.red}</div>
        <div className="stat-label">Red</div>
      </div>
      <div className="stat-card">
        <div className="stat-number stat-yellow">{stats.yellow}</div>
        <div className="stat-label">Yellow</div>
      </div>
      <div className="stat-card">
        <div className="stat-number stat-green">{stats.green}</div>
        <div className="stat-label">Green</div>
      </div>
      <div className="stat-card">
        <div className="stat-number stat-black">{stats.black}</div>
        <div className="stat-label">Black</div>
      </div>
    </div>
  );
}; 