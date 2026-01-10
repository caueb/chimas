import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

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

const RATING_COLORS: Record<string, string> = {
  Black: 'var(--black)',
  Red: 'var(--red)',
  Yellow: 'var(--yellow)',
  Green: 'var(--green)'
};

export const RatingDistributionChart: React.FC<RatingDistributionChartProps> = ({ stats }) => {
  const data: RatingData[] = [
    {
      name: 'Black',
      value: stats.black,
      color: RATING_COLORS.Black,
      percentage: stats.total > 0 ? ((stats.black / stats.total) * 100).toFixed(1) : '0'
    },
    {
      name: 'Red',
      value: stats.red,
      color: RATING_COLORS.Red,
      percentage: stats.total > 0 ? ((stats.red / stats.total) * 100).toFixed(1) : '0'
    },
    {
      name: 'Yellow',
      value: stats.yellow,
      color: RATING_COLORS.Yellow,
      percentage: stats.total > 0 ? ((stats.yellow / stats.total) * 100).toFixed(1) : '0'
    },
    {
      name: 'Green',
      value: stats.green,
      color: RATING_COLORS.Green,
      percentage: stats.total > 0 ? ((stats.green / stats.total) * 100).toFixed(1) : '0'
    }
  ];

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
      const item = payload[0].payload;
      return (
        <div className="chart-tooltip">
          <div className="tooltip-label">{item.name}</div>
          <div className="tooltip-value">{item.value} files ({item.percentage}%)</div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="chart-container rating-chart">
      <h3 className="chart-title">Files by Rating</h3>
      <div className="chart-subtitle">Distribution of {stats.total} files by Snaffler severity rating</div>
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={160}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 50, bottom: 5 }}
          >
            <XAxis type="number" />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fontSize: 12 }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="value" radius={[0, 4, 4, 0]}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
