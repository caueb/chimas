import React from 'react';
import { FileResult } from '../types';
import { extractUserInfo } from '../utils/parser';

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
  credentialsKeywords: string[];
  onNavigateToResults: () => void;
  onFilterBySystem: (systemId: string) => void;
  onFilterByShare: (sharePath: string) => void;
  onFilterByExtension: (extension: string) => void;
  onSelectFile: (file: FileResult) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ stats, allResults, shareResults, credentialsKeywords, onNavigateToResults, onFilterBySystem, onFilterByShare, onFilterByExtension, onSelectFile }) => {
  const formatFileSize = (size: string) => {
    const sizeNum = parseInt(size);
    if (isNaN(sizeNum)) return '0 B';
    
    if (sizeNum < 1024) return `${sizeNum} B`;
    if (sizeNum < 1024 * 1024) return `${(sizeNum / 1024).toFixed(1)} KB`;
    if (sizeNum < 1024 * 1024 * 1024) return `${(sizeNum / (1024 * 1024)).toFixed(1)} MB`;
    return `${(sizeNum / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

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

  const getCredentialsFiles = () => {
    return allResults
      .filter(result => {
        const searchText = [
          result.matchContext,
          ...result.matchedStrings
        ].join(' ').toLowerCase();
        
        return credentialsKeywords.some(keyword => 
          searchText.includes(keyword.toLowerCase())
        );
      })
      .sort((a, b) => {
        // Prioritize red files, then by size
        if (a.rating.toLowerCase() === 'red' && b.rating.toLowerCase() !== 'red') return -1;
        if (b.rating.toLowerCase() === 'red' && a.rating.toLowerCase() !== 'red') return 1;
        return (parseInt(b.size) || 0) - (parseInt(a.size) || 0);
      })
      .slice(0, 10);
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

  const topSystems = getTopSystems();
  const topFileTypes = getTopFileTypes();
  const credentialsFiles = getCredentialsFiles();
  const largestFiles = getLargestFiles();
  const recentFiles = getRecentFiles();
  const userInfo = getUserInfo();

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Dashboard</h1>
        <p>Overview of Chimas scan results and insights</p>
      </div>

      <div className="dashboard-grid">
        {/* Main Stats Cards */}
        <div className="stats-section">
          <h2>File Statistics</h2>
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
          <div className="stats-percentage-bar">
            <div className="percentage-bar-container">
              <div 
                className="percentage-segment black" 
                style={{ width: `${stats.total > 0 ? (stats.black / stats.total) * 100 : 0}%` }}
                title={`Black: ${stats.black} (${stats.total > 0 ? ((stats.black / stats.total) * 100).toFixed(1) : '0'}%)`}
              >
                <span className="segment-count">{stats.black}</span>
              </div>
              <div 
                className="percentage-segment red" 
                style={{ width: `${stats.total > 0 ? (stats.red / stats.total) * 100 : 0}%` }}
                title={`Red: ${stats.red} (${stats.total > 0 ? ((stats.red / stats.total) * 100).toFixed(1) : '0'}%)`}
              >
                <span className="segment-count">{stats.red}</span>
              </div>
              <div 
                className="percentage-segment yellow" 
                style={{ width: `${stats.total > 0 ? (stats.yellow / stats.total) * 100 : 0}%` }}
                title={`Yellow: ${stats.yellow} (${stats.total > 0 ? ((stats.yellow / stats.total) * 100).toFixed(1) : '0'}%)`}
              >
                <span className="segment-count">{stats.yellow}</span>
              </div>
              <div 
                className="percentage-segment green" 
                style={{ width: `${stats.total > 0 ? (stats.green / stats.total) * 100 : 0}%` }}
                title={`Green: ${stats.green} (${stats.total > 0 ? ((stats.green / stats.total) * 100).toFixed(1) : '0'}%)`}
              >
                <span className="segment-count">{stats.green}</span>
              </div>
            </div>
            <div className="percentage-bar-legend">
              <div className="legend-item">
                <span className="legend-color black"></span>
                <span className="legend-label">Black</span>
                <span className="legend-count">{stats.black}</span>
                <span className="legend-percentage">({stats.total > 0 ? ((stats.black / stats.total) * 100).toFixed(1) : '0'}%)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color red"></span>
                <span className="legend-label">Red</span>
                <span className="legend-count">{stats.red}</span>
                <span className="legend-percentage">({stats.total > 0 ? ((stats.red / stats.total) * 100).toFixed(1) : '0'}%)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color yellow"></span>
                <span className="legend-label">Yellow</span>
                <span className="legend-count">{stats.yellow}</span>
                <span className="legend-percentage">({stats.total > 0 ? ((stats.yellow / stats.total) * 100).toFixed(1) : '0'}%)</span>
              </div>
              <div className="legend-item">
                <span className="legend-color green"></span>
                <span className="legend-label">Green</span>
                <span className="legend-count">{stats.green}</span>
                <span className="legend-percentage">({stats.total > 0 ? ((stats.green / stats.total) * 100).toFixed(1) : '0'}%)</span>
              </div>
              <div className="legend-item total">
                <span className="legend-label">Total</span>
                <span className="legend-count">{stats.total}</span>
                <span className="legend-percentage">(100%)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Top Systems and File Types - Side by Side */}
        <div className="insights-section">
          <h2>Top Systems</h2>
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

        {/* High-Risk and Largest Files - Side by Side */}
        <div className="insights-section">
          <h2>Potentially Plaintext Creds</h2>
          <div className="insights-card compact">
            {credentialsFiles.length > 0 ? (
              <div className="insights-list compact">
                {credentialsFiles.map((file, index) => (
                  <div 
                    key={index} 
                    className="insight-item clickable compact"
                    onClick={() => {
                      onNavigateToResults();
                      onSelectFile(file);
                    }}
                  >
                    <div className={`insight-rank compact rating-${file.rating.toLowerCase()}`}>#{index + 1}</div>
                    <div className="insight-content">
                      <div className="insight-primary compact">{file.fileName}</div>
                      <div className="insight-secondary compact">{formatFileSize(file.size)} • {file.rating}</div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">No credential files found</div>
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