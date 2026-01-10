import React from 'react';
import { FileResult } from '../types';
import { extractUserInfo } from '../utils/parser';
import { formatFileSize } from '../utils/formatting';
import { RiskDistributionChart, TimelineChart, FileTypeChart, RatingDistributionChart } from './charts';

interface DashboardProps {
  stats: {
    total: number;
    red: number;
    yellow: number;
    green: number;
    black: number;
  };
  allResults: FileResult[];
  shareResults: any[];
  onNavigateToResults: () => void;
  onFilterBySystem: (systemId: string) => void;
  onFilterByShare: (sharePath: string) => void;
  onFilterByExtension: (extension: string) => void;
  onSelectFile: (file: FileResult) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ stats, allResults, shareResults, onNavigateToResults, onFilterBySystem, onFilterByShare, onFilterByExtension, onSelectFile }) => {
  const getTopSystems = () => {
    const systemCounts: Record<string, number> = {};
    
    allResults.forEach(result => {
      const pathMatch = result.fullPath.match(/\\\\([^\\]+)/);
      if (pathMatch) {
        const systemId = pathMatch[1];
        systemCounts[systemId] = (systemCounts[systemId] || 0) + 1;
      }
    });
    
    return Object.entries(systemCounts)
      .map(([systemId, count]) => ({ ip: systemId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  };

  const getTopFileTypes = () => {
    const fileTypeCounts: Record<string, number> = {};
    
    allResults.forEach(result => {
      // Extract extension from the actual file name, not content
      const fileName = result.fileName;
      const lastDotIndex = fileName.lastIndexOf('.');
      
      // Only include files that have a valid extension (not at the end of the filename)
      if (lastDotIndex > 0 && lastDotIndex < fileName.length - 1) {
        const extension = fileName.substring(lastDotIndex + 1).toLowerCase();
        // Filter out empty extensions and common non-extension patterns
        if (extension && extension.length > 0 && extension !== 'no-extension') {
          fileTypeCounts[extension] = (fileTypeCounts[extension] || 0) + 1;
        }
      }
    });
    
    return Object.entries(fileTypeCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 10)
      .map(([type, count]) => ({ type, count }));
  };

  const getLargestFiles = () => {
    return allResults
      .filter(result => {
        // Ensure we have a valid size
        const size = parseInt(result.size);
        return !isNaN(size) && size >= 0;
      })
      .sort((a, b) => (parseInt(b.size) || 0) - (parseInt(a.size) || 0))
      .slice(0, 10)
      .map(result => ({
        name: result.fileName,
        size: formatFileSize(result.size),
        path: result.fullPath,
        rating: result.rating
      }));
  };

  const getRecentFiles = () => {
    return allResults
      .filter(result => result.lastModified)
      .sort((a, b) => new Date(b.lastModified).getTime() - new Date(a.lastModified).getTime())
      .slice(0, 10)
      .map(result => {
        const date = new Date(result.lastModified);
        const day = date.getDate().toString().padStart(2, '0');
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const year = date.getFullYear();
        const formattedDate = `${day}/${month}/${year}`;
        
        return {
        name: result.fileName,
          date: formattedDate,
        path: result.fullPath,
        rating: result.rating
        };
      });
  };

  const getUserInfo = () => {
    return extractUserInfo(allResults);
  };

  const getHighestRiskFiles = () => {
    return allResults
      .filter(result => result.riskScore && result.riskScore.total > 0)
      .sort((a, b) => (b.riskScore?.total || 0) - (a.riskScore?.total || 0))
      .slice(0, 10);
  };

  const topSystems = getTopSystems();
  const topFileTypes = getTopFileTypes();
  const largestFiles = getLargestFiles();
  const recentFiles = getRecentFiles();
  const highestRiskFiles = getHighestRiskFiles();
  const userInfo = getUserInfo();

  return (
    <div className="dashboard">
      <div className="dashboard-grid">
        {/* Main Stats Cards */}
        <div className="stats-section">
          {userInfo.users.length > 0 && (
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
          )}
          <RatingDistributionChart stats={stats} />
        </div>

        {/* Charts Section */}
        <div className="charts-section">
          <RiskDistributionChart results={allResults} />
          <TimelineChart results={allResults} />
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
                  // Find the original FileResult from allResults
                  const originalFile = allResults.find(result => 
                    result.fileName === file.name && 
                    result.fullPath === file.path
                  );
                  
                  return (
                    <div 
                      key={index} 
                      className="insight-item clickable compact"
                      onClick={() => {
                        if (originalFile) {
                          onNavigateToResults();
                          onSelectFile(originalFile);
                        }
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
                  // Find the original FileResult from allResults
                  const originalFile = allResults.find(result => 
                    result.fileName === file.name && 
                    result.fullPath === file.path
                  );
                  
                  return (
                    <div 
                      key={index} 
                      className="insight-item clickable compact"
                      onClick={() => {
                        if (originalFile) {
                          onNavigateToResults();
                          onSelectFile(originalFile);
                        }
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
      </div>
    </div>
  );
}; 