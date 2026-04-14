import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { FileResult } from '../../types';

interface TimelineChartProps {
  results: FileResult[];
  onPeriodClick?: (period: string) => void;
}

interface TimelineData {
  period: string;
  count: number;
  daysAgo: number;
}

const PERIOD_COLORS = [
  'var(--red)',      // Last 7 days - most urgent
  'var(--orange, #e67e22)',  // Last 30 days
  'var(--yellow)',   // Last 90 days
  'var(--text-muted)'  // Older
];

export const TimelineChart: React.FC<TimelineChartProps> = ({ results, onPeriodClick }) => {
  const getTimelineDistribution = (): TimelineData[] => {
    const now = new Date();
    const counts = {
      week: 0,
      month: 0,
      quarter: 0,
      older: 0
    };

    results.forEach(result => {
      if (!result.lastModified) return;

      try {
        const modDate = new Date(result.lastModified);
        const daysDiff = (now.getTime() - modDate.getTime()) / (1000 * 60 * 60 * 24);

        if (daysDiff <= 7) {
          counts.week++;
        } else if (daysDiff <= 30) {
          counts.month++;
        } else if (daysDiff <= 90) {
          counts.quarter++;
        } else {
          counts.older++;
        }
      } catch {
        // Invalid date
      }
    });

    return [
      { period: 'Last 7 days', count: counts.week, daysAgo: 7 },
      { period: 'Last 30 days', count: counts.month, daysAgo: 30 },
      { period: 'Last 90 days', count: counts.quarter, daysAgo: 90 },
      { period: 'Older', count: counts.older, daysAgo: 999 }
    ];
  };

  const data = getTimelineDistribution();
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <div className="chart-container">
        <h3 className="chart-title">Modification Timeline</h3>
        <div className="chart-no-data">No modification dates available</div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">Modification Timeline</h3>
      <div className="chart-subtitle">When were sensitive files last modified?</div>
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={data}
            margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
          >
            <XAxis dataKey="period" tick={{ fontSize: 11 }} />
            <YAxis />
            <Tooltip
              formatter={(value) => [value ?? 0, 'Files']}
              contentStyle={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '4px'
              }}
            />
            <Bar dataKey="count" cursor="pointer">
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={PERIOD_COLORS[index]} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-insight">
        {data[0].count > 0 && (
          <div className="chart-insight-item highlight">
            <i className="fas fa-exclamation-triangle"></i>
            <span>{data[0].count} files modified in the last 7 days</span>
          </div>
        )}
      </div>
    </div>
  );
};
