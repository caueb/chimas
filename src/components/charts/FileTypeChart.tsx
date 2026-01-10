import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { FileResult } from '../../types';

interface FileTypeChartProps {
  results: FileResult[];
  onExtensionClick?: (extension: string) => void;
}

interface FileTypeData {
  extension: string;
  critical: number;
  high: number;
  medium: number;
  low: number;
  total: number;
}

const RISK_COLORS = {
  critical: 'var(--red)',
  high: 'var(--orange, #e67e22)',
  medium: 'var(--yellow)',
  low: 'var(--green)'
};

export const FileTypeChart: React.FC<FileTypeChartProps> = ({ results, onExtensionClick }) => {
  const getFileTypeDistribution = (): FileTypeData[] => {
    const extensionMap: Record<string, FileTypeData> = {};

    results.forEach(result => {
      const fileName = result.fileName;
      const lastDotIndex = fileName.lastIndexOf('.');

      if (lastDotIndex > 0 && lastDotIndex < fileName.length - 1) {
        const ext = fileName.substring(lastDotIndex + 1).toLowerCase();

        if (!extensionMap[ext]) {
          extensionMap[ext] = {
            extension: `.${ext}`,
            critical: 0,
            high: 0,
            medium: 0,
            low: 0,
            total: 0
          };
        }

        extensionMap[ext].total++;

        if (result.riskScore?.level) {
          extensionMap[ext][result.riskScore.level]++;
        }
      }
    });

    return Object.values(extensionMap)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  };

  const data = getFileTypeDistribution();

  if (data.length === 0) {
    return (
      <div className="chart-container">
        <h3 className="chart-title">File Types by Risk</h3>
        <div className="chart-no-data">No file type data available</div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">Top File Types by Risk</h3>
      <div className="chart-subtitle">Which file types pose the highest risk?</div>
      <div className="chart-wrapper">
        <ResponsiveContainer width="100%" height={250}>
          <BarChart
            data={data}
            layout="vertical"
            margin={{ top: 5, right: 30, left: 50, bottom: 5 }}
          >
            <XAxis type="number" />
            <YAxis type="category" dataKey="extension" tick={{ fontSize: 11 }} interval={0} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-surface)',
                border: '1px solid var(--border)',
                borderRadius: '4px'
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Bar dataKey="critical" stackId="a" fill={RISK_COLORS.critical} name="Critical" />
            <Bar dataKey="high" stackId="a" fill={RISK_COLORS.high} name="High" />
            <Bar dataKey="medium" stackId="a" fill={RISK_COLORS.medium} name="Medium" />
            <Bar dataKey="low" stackId="a" fill={RISK_COLORS.low} name="Low" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
