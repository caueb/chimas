import React from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface RatingDistributionChartProps {
  stats: {
    total: number;
    red: number;
    yellow: number;
    green: number;
    black: number;
  };
}

interface RatingData {
  name: string;
  value: number;
  color: string;
  percentage: string;
}

/** Solid fills for SVG (CSS vars are unreliable in some chart renders) */
const RATING_COLORS: Record<string, string> = {
  Black: '#1a2433',
  Red: '#ff5c6a',
  Yellow: '#e5ff75',
  Green: '#5fd38a',
};

export const RatingDistributionChart: React.FC<RatingDistributionChartProps> = ({ stats }) => {
  const data: RatingData[] = [
    {
      name: 'Black',
      value: stats.black,
      color: RATING_COLORS.Black,
      percentage: stats.total > 0 ? ((stats.black / stats.total) * 100).toFixed(1) : '0',
    },
    {
      name: 'Red',
      value: stats.red,
      color: RATING_COLORS.Red,
      percentage: stats.total > 0 ? ((stats.red / stats.total) * 100).toFixed(1) : '0',
    },
    {
      name: 'Yellow',
      value: stats.yellow,
      color: RATING_COLORS.Yellow,
      percentage: stats.total > 0 ? ((stats.yellow / stats.total) * 100).toFixed(1) : '0',
    },
    {
      name: 'Green',
      value: stats.green,
      color: RATING_COLORS.Green,
      percentage: stats.total > 0 ? ((stats.green / stats.total) * 100).toFixed(1) : '0',
    },
  ].filter((d) => d.value > 0);

  if (stats.total === 0) {
    return (
      <div className="chart-container rating-chart">
        <h3 className="chart-title">Files by Rating</h3>
        <div className="chart-no-data">No files loaded</div>
      </div>
    );
  }

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const item = payload[0].payload as RatingData;
      return (
        <div className="chart-tooltip">
          <div className="tooltip-label">{item.name}</div>
          <div className="tooltip-value">
            {item.value} files ({item.percentage}%)
          </div>
        </div>
      );
    }
    return null;
  };

  const renderLegend = (props: any) => {
    const { payload } = props;
    if (!payload) return null;
    return (
      <div className="chart-legend rating-pie-legend">
        {payload.map((entry: any) => {
          const item = entry.payload as RatingData;
          return (
            <div key={item.name} className="chart-legend-item">
              <span
                className="chart-legend-color"
                style={{ backgroundColor: item.color }}
              />
              <span className="chart-legend-label">{item.name}</span>
              <span className="chart-legend-value">
                {item.value} ({item.percentage}%)
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="chart-container rating-chart">
      <h3 className="chart-title">Files by Rating</h3>
      <div className="chart-subtitle">
        Distribution of {stats.total} files by Snaffler severity rating
      </div>
      <div className="chart-wrapper rating-pie-wrapper">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={52}
              outerRadius={88}
              paddingAngle={2}
              stroke="var(--bg-surface)"
              strokeWidth={2}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip content={<CustomTooltip />} />
            <Legend content={renderLegend} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
