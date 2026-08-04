import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { FileResult } from '../../types';

interface FileTypeChartProps {
  results: FileResult[];
  onExtensionClick?: (extension: string) => void;
}

interface FileTypeData {
  extension: string;
  black: number;
  red: number;
  yellow: number;
  green: number;
  total: number;
}

const RATING_COLORS = {
  black: '#1a2433',
  red: '#ff5c6a',
  yellow: '#e5ff75',
  green: '#5fd38a',
};

export const FileTypeChart: React.FC<FileTypeChartProps> = ({ results }) => {
  const getFileTypeDistribution = (): FileTypeData[] => {
    const extensionMap: Record<string, FileTypeData> = {};

    results.forEach((result) => {
      const fileName = result.fileName;
      const lastDotIndex = fileName.lastIndexOf('.');

      if (lastDotIndex > 0 && lastDotIndex < fileName.length - 1) {
        const ext = fileName.substring(lastDotIndex + 1).toLowerCase();

        if (!extensionMap[ext]) {
          extensionMap[ext] = {
            extension: `.${ext}`,
            black: 0,
            red: 0,
            yellow: 0,
            green: 0,
            total: 0,
          };
        }

        extensionMap[ext].total++;

        const rating = (result.rating || '').toLowerCase();
        if (rating === 'black' || rating === 'red' || rating === 'yellow' || rating === 'green') {
          extensionMap[ext][rating]++;
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
        <h3 className="chart-title">Top File Types by Rating</h3>
        <div className="chart-no-data">No file type data available</div>
      </div>
    );
  }

  return (
    <div className="chart-container">
      <h3 className="chart-title">Top File Types by Rating</h3>
      <div className="chart-subtitle">File extensions stacked by Snaffler severity rating</div>
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
                borderRadius: '4px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
            <Bar dataKey="black" stackId="a" fill={RATING_COLORS.black} name="Black" />
            <Bar dataKey="red" stackId="a" fill={RATING_COLORS.red} name="Red" />
            <Bar dataKey="yellow" stackId="a" fill={RATING_COLORS.yellow} name="Yellow" />
            <Bar dataKey="green" stackId="a" fill={RATING_COLORS.green} name="Green" />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
