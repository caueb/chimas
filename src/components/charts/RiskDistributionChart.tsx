import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { FileResult } from '../../types';

interface RiskDistributionChartProps {
  results: FileResult[];
  onRiskLevelClick?: (level: string) => void;
}

interface RiskData {
  level: string;
  count: number;
  color: string;
}

const RISK_COLORS: Record<string, string> = {
  critical: 'var(--red)',
  high: 'var(--orange, #e67e22)',
  medium: 'var(--yellow)',
  low: 'var(--green)'
};

export const RiskDistributionChart: React.FC<RiskDistributionChartProps> = ({ results, onRiskLevelClick }) => {
  const getRiskDistribution = (): RiskData[] => {
    const counts = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0
    };

    results.forEach(result => {
      if (result.riskScore?.level) {
        counts[result.riskScore.level]++;
      }
    });

    return [
      { level: 'Critical', count: counts.critical, color: RISK_COLORS.critical },
      { level: 'High', count: counts.high, color: RISK_COLORS.high },
      { level: 'Medium', count: counts.medium, color: RISK_COLORS.medium },
      { level: 'Low', count: counts.low, color: RISK_COLORS.low }
    ];
  };

  const data = getRiskDistribution();
  const totalWithRisk = data.reduce((sum, d) => sum + d.count, 0);

  if (totalWithRisk === 0) {
    return (
      <div className="chart-container">
        <h3 className="chart-title">Risk Distribution</h3>
        <div className="chart-no-data">No risk scores calculated</div>
      </div>
    );
  }

  const handleClick = (data: RiskData) => {
    if (onRiskLevelClick) {
      onRiskLevelClick(data.level.toLowerCase());
    }
  };

  return (
    <div className="chart-container">
      <h3 className="chart-title">Risk Distribution</h3>
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 60, bottom: 5 }}
          >
            <XAxis type="number" />
            <YAxis type="category" dataKey="level" />
            <Tooltip
              formatter={(value) => [value ?? 0, 'Files']}
              contentStyle={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '4px'
              }}
            />
            <Bar
              dataKey="count"
              cursor="pointer"
              onClick={(data) => handleClick(data as unknown as RiskData)}
            >
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-legend">
        {data.map((item) => (
          <div key={item.level} className="chart-legend-item">
            <span className="chart-legend-color" style={{ backgroundColor: item.color }}></span>
            <span className="chart-legend-label">{item.level}</span>
            <span className="chart-legend-value">{item.count}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
