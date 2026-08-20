import React, { useMemo } from 'react';
import { FileResult, ShareInfo } from '../types';
import { extractUserInfo, safeDateTimestamp } from '../utils/parser';
import { formatFileSize } from '../utils/formatting';
import { FileTypeChart, RatingDistributionChart } from './charts';
import { AttackOpportunities } from './AttackOpportunities';

function topN<T>(items: T[], n: number, compare: (a: T, b: T) => number): T[] {
  const top: T[] = [];
  for (const item of items) {
    if (top.length < n) {
      top.push(item);
      top.sort(compare);
      continue;
    }
    if (compare(item, top[top.length - 1]) < 0) {
      top[top.length - 1] = item;
      top.sort(compare);
    }
  }
  return top;
}

interface DashboardProps {
  stats: {
    total: number;
    red: number;
    yellow: number;
    green: number;
    black: number;
  };
  allResults: FileResult[];
  shareResults: ShareInfo[];
  onNavigateToResults: () => void;
  onNavigateToShares: () => void;
  onFilterBySystem: (systemId: string) => void;
  onFilterByShare: (sharePath: string) => void;
  onFilterByExtension: (extension: string | string[]) => void;
  onFilterByPlaybookFiles: (paths: string[], label: string) => void;
  onSelectFile: (file: FileResult) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ stats, allResults, shareResults, onNavigateToResults, onNavigateToShares, onFilterBySystem, onFilterByShare, onFilterByExtension, onFilterByPlaybookFiles, onSelectFile }) => {
  const {
    topSystems,
    topFileTypes,
    largestFiles,
    recentFiles,
    highestRiskFiles,
    userInfo,
  } = useMemo(() => {
    const systemCounts: Record<string, number> = {};
    const fileTypeCounts: Record<string, number> = {};

    for (const result of allResults) {
      const pathMatch = result.fullPath.match(/\\\\([^\\]+)/);
      if (pathMatch) {
        const systemId = pathMatch[1];
        systemCounts[systemId] = (systemCounts[systemId] || 0) + 1;
      }

      const fileName = result.fileName;
      const lastDotIndex = fileName.lastIndexOf('.');
      if (lastDotIndex > 0 && lastDotIndex < fileName.length - 1) {
        const extension = fileName.substring(lastDotIndex + 1).toLowerCase();
        if (extension && extension !== 'no-extension') {
          fileTypeCounts[extension] = (fileTypeCounts[extension] || 0) + 1;
        }
      }
    }

    const topSystems = Object.entries(systemCounts)
      .map(([systemId, count]) => ({ ip: systemId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topFileTypes = Object.entries(fileTypeCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));

    const largestSource = topN(
      allResults.filter((result) => {
        const size = parseInt(result.size);
        return !isNaN(size) && size >= 0;
      }),
      10,
      (a, b) => (parseInt(b.size) || 0) - (parseInt(a.size) || 0)
    );

    const largestFiles = largestSource.map((result) => ({
      result,
      name: result.fileName,
      size: formatFileSize(result.size),
      path: result.fullPath,
      rating: result.rating,
    }));

    const recentSource = topN(
      allResults.filter((result) => result.lastModified && safeDateTimestamp(result.lastModified) > 0),
      10,
      (a, b) => safeDateTimestamp(b.lastModified) - safeDateTimestamp(a.lastModified)
    );

    const recentFiles = recentSource.map((result) => {
      const timestamp = safeDateTimestamp(result.lastModified);
      const date = timestamp ? new Date(result.lastModified) : null;
      const formattedDate = date
        ? `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`
        : '-';
      return {
        result,
        name: result.fileName,
        date: formattedDate,
        path: result.fullPath,
        rating: result.rating,
      };
    });

    const highestRiskFiles = topN(
      allResults.filter((result) => result.riskScore && result.riskScore.total > 0),
      10,
      (a, b) => (b.riskScore?.total || 0) - (a.riskScore?.total || 0)
    );

    return {
      topSystems,
      topFileTypes,
      largestFiles,
      recentFiles,
      highestRiskFiles,
      userInfo: extractUserInfo(allResults),
    };
  }, [allResults]);

  return (
    <div className="dashboard">
      <div className="dashboard-grid">
        {userInfo.users.length > 0 && (
          <div className="stats-section">
            <div className="scan-user-info">
              <span className="scan-user-label">Snaffler run by:</span>
              <span className="scan-user-details">
                {userInfo.users.map((user, index) => (
                  <span key={index} className="scan-user-item">
                    {user.user}@{user.machine}
                    {index < userInfo.users.length - 1 && <span className="scan-user-separator">, </span>}
                  </span>
                ))}
              </span>
            </div>
          </div>
        )}

        {/* Charts: rating pie (half) + file types (half) */}
        <div className="charts-section">
          <RatingDistributionChart stats={stats} />
          <FileTypeChart results={allResults} />
        </div>

        {/* Top Systems and File Types - Side by Side */}
        <div className="insights-section">
          <h2>Most Files Count</h2>
          <div className="insights-card compact">
            {topSystems.length > 0 ? (
              <div className="insights-list compact">
                {topSystems.map((item, index) => {
                  return (
                    <div 
                      key={item.ip} 
                      className="insight-item clickable compact"
                      onClick={() => {
                        onNavigateToResults();
                        onFilterBySystem(item.ip);
                      }}
                    >
                      <div className="insight-rank compact">#{index + 1}</div>
                      <div className="insight-content">
                        <div className="insight-primary compact">{item.ip}</div>
                        <div className="insight-secondary compact">{item.count} files</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="no-data">No systems found</div>
            )}
          </div>
        </div>

        <div className="insights-section">
          <h2>Top File Types</h2>
          <div className="insights-card compact">
            {topFileTypes.length > 0 ? (
              <div className="insights-list compact">
                {topFileTypes.map((item, index) => (
                  <div 
                    key={item.type} 
                    className="insight-item clickable compact"
                    onClick={() => {
                      onNavigateToResults();
                      onFilterByExtension(item.type);
                    }}
                  >
                    <div className="insight-rank compact">#{index + 1}</div>
                    <div className="insight-content">
                      <div className="insight-primary compact">.{item.type}</div>
                      <div className="insight-secondary compact">{item.count} files</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">No file types found</div>
            )}
          </div>
        </div>

        {/* Accessible Shares */}
        <div className="insights-section">
          <h2>Top Accessible Shares</h2>
          <div className="insights-card compact">
            {shareResults.length > 0 ? (
              <div className="insights-list compact">
                {shareResults.slice(0, 10).map((share, index) => {
                  return (
                    <div 
                      key={index} 
                      className="insight-item clickable compact"
                      onClick={() => {
                        onNavigateToResults();
                        onFilterByShare(`${share.systemId}\\${share.shareName}`);
                      }}
                    >
                      <div className="insight-rank compact">#{index + 1}</div>
                      <div className="insight-content">
                        <div className="insight-primary compact">
                          {share.systemId}\{share.shareName}
                        </div>
                        <div className="insight-secondary compact">{share.fileCount || 0} files • {share.permissions}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="no-data">No accessible shares found</div>
            )}
          </div>
        </div>

        {/* Highest Risk Files */}
        <div className="insights-section">
          <h2>Highest Risk Files</h2>
          <div className="insights-card compact">
            {highestRiskFiles.length > 0 ? (
              <div className="insights-list compact">
                {highestRiskFiles.map((file, index) => (
                  <div
                    key={index}
                    className="insight-item clickable compact"
                    onClick={() => {
                      onNavigateToResults();
                      onSelectFile(file);
                    }}
                  >
                    <div className="insight-rank compact">
                      #{index + 1}
                    </div>
                    <div className="insight-content">
                      <div className="insight-primary compact">{file.fileName}</div>
                      <div className="insight-secondary compact">
                        <span className={`risk-score-badge risk-bg-${file.riskScore!.level}`}>
                          {file.riskScore!.total}
                        </span>
                        {file.rating} • {file.riskScore!.factors.length} factors
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">No risk scores calculated</div>
            )}
          </div>
        </div>

        <div className="insights-section">
          <h2>Largest Files</h2>
          <div className="insights-card compact">
            {largestFiles.length > 0 ? (
              <div className="insights-list compact">
                {largestFiles.map((file, index) => {
                  return (
                    <div 
                      key={index} 
                      className="insight-item clickable compact"
                      onClick={() => {
                        onNavigateToResults();
                        onSelectFile(file.result);
                      }}
                    >
                      <div className={`insight-rank compact rating-${file.rating.toLowerCase()}`}>#{index + 1}</div>
                      <div className="insight-content">
                        <div className="insight-primary compact">{file.name}</div>
                        <div className="insight-secondary compact">{file.size} • {file.rating}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="no-data">No large files found</div>
            )}
          </div>
        </div>

        {/* Recent Files */}
        <div className="insights-section">
          <h2>Recent Files</h2>
          <div className="insights-card compact">
            {recentFiles.length > 0 ? (
              <div className="insights-list compact">
                {recentFiles.map((file, index) => {
                  return (
                    <div 
                      key={index} 
                      className="insight-item clickable compact"
                      onClick={() => {
                        onNavigateToResults();
                        onSelectFile(file.result);
                      }}
                    >
                      <div className={`insight-rank compact rating-${file.rating.toLowerCase()}`}>#{index + 1}</div>
                      <div className="insight-content">
                        <div className="insight-primary compact">{file.name}</div>
                        <div className="insight-secondary compact">{file.date} • {file.rating}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="no-data">No recent files found</div>
            )}
          </div>
        </div>

        <AttackOpportunities
          results={allResults}
          shareResults={shareResults}
          onSelectFile={onSelectFile}
          onFilterByPlaybookFiles={onFilterByPlaybookFiles}
          onNavigateToResults={onNavigateToResults}
          onNavigateToShares={onNavigateToShares}
        />
      </div>
    </div>
  );
}; 