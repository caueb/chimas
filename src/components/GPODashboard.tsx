import React, { useMemo } from 'react';
import { GPOReport } from '../utils/GPOParser';
import type { BloodHoundData } from '../types/BloodHound';
import { getBloodHoundSummary, resolveGPOAssets, normalizeAdGuid } from '../utils/bloodhoundParser';

interface GPODashboardProps {
  report: GPOReport;
  bloodHoundData: BloodHoundData | null;
  onLoadBloodHound: () => void;
}

export const GPODashboard: React.FC<GPODashboardProps> = ({ report, bloodHoundData, onLoadBloodHound }) => {
  const summary = useMemo(() => {
    const totalGpos = report.gpos.length;
    let totalSettings = 0;
    let computerSettings = 0;
    let userSettings = 0;
    let otherSettings = 0;
    let linkedGpos = 0;
    let notLinkedGpos = 0;
    const findingCounts: Record<string, number> = {};

    const severityRank = (t?: string) => {
      switch ((t || '').toLowerCase()) {
        case 'black': return 4;
        case 'red': return 3;
        case 'yellow': return 2;
        case 'green': return 1;
        default: return 0;
      }
    };

    const gposWithFindings = report.gpos.map(gpo => {
      const findingsCount = gpo.settings.reduce((total, setting) => {
        return total + (setting.findings ? setting.findings.length : 0);
      }, 0);
      return { name: gpo.header.gpo || gpo.startedAtRaw || 'GPO', findingsCount };
    }).sort((a, b) => b.findingsCount - a.findingsCount).slice(0, 10);

    const gposBySeverity = report.gpos.map(gpo => {
      let totalSeverityScore = 0;
      const severityCounts: Record<string, number> = {};
      gpo.settings.forEach(setting => {
        (setting.findings || []).forEach(finding => {
          const findingType = finding.type || 'Unknown';
          severityCounts[findingType] = (severityCounts[findingType] || 0) + 1;
        });
      });
      Object.entries(severityCounts).forEach(([findingType, count]) => {
        totalSeverityScore += severityRank(findingType) * count;
      });
      return {
        name: gpo.header.gpo || gpo.startedAtRaw || 'GPO',
        severityScore: totalSeverityScore,
        severityCounts,
      };
    }).sort((a, b) => b.severityScore - a.severityScore).slice(0, 10);

    report.gpos.forEach(gpo => {
      totalSettings += gpo.settings.length;
      const hasLinks = gpo.header.links && gpo.header.links.length > 0;
      const hasOldLink = gpo.header.Link && (Array.isArray(gpo.header.Link) ? gpo.header.Link.length > 0 : gpo.header.Link.trim() !== '');
      if (hasLinks || hasOldLink) linkedGpos++;
      else notLinkedGpos++;

      gpo.settings.forEach(s => {
        const scope = (s.scope || '').toLowerCase();
        if (scope.includes('computer')) {
          computerSettings++;
        } else if (scope.includes('user')) {
          userSettings++;
        } else {
          otherSettings++;
        }

        (s.findings || []).forEach(f => {
          const key = (f.type || 'Unknown').toString();
          findingCounts[key] = (findingCounts[key] || 0) + 1;
        });
      });
    });

    const ratingOrder = ['Red', 'Yellow', 'Green', 'Black', 'Unknown'];
    const findingsList = ratingOrder
      .filter(k => findingCounts[k])
      .map(k => ({ type: k, count: findingCounts[k] }));

    return {
      totalGpos,
      totalSettings,
      computerSettings,
      userSettings,
      otherSettings,
      linkedGpos,
      notLinkedGpos,
      findingsList,
      gposWithFindings,
      gposBySeverity,
    };
  }, [report]);

  const bhSummary = useMemo(() => {
    if (!bloodHoundData) return null;
    const stats = getBloodHoundSummary(bloodHoundData);

    const gpoCoverage = report.gpos
      .filter(gpo => gpo.header.gpoId)
      .map(gpo => {
        const assets = resolveGPOAssets(bloodHoundData, gpo.header.gpoId!, gpo.header.links);
        return {
          name: gpo.header.gpo || 'Unknown GPO',
          computers: assets.totalComputers,
          users: assets.totalUsers,
          groups: assets.totalGroups,
          isDomainWide: assets.isDomainWide,
        };
      })
      .sort((a, b) => (b.computers + b.users) - (a.computers + a.users));

    const allComputers = new Set<string>();
    const allUsers = new Set<string>();
    report.gpos.forEach(gpo => {
      if (!gpo.header.gpoId) return;
      const assets = resolveGPOAssets(bloodHoundData, gpo.header.gpoId, gpo.header.links);
      assets.computers.forEach(c => allComputers.add(c.name));
      assets.users.forEach(u => allUsers.add(u.name));
    });

    const correlatedCount = report.gpos.filter(gpo => {
      if (!gpo.header.gpoId) return false;
      return bloodHoundData.adGuidToBhId.has(normalizeAdGuid(gpo.header.gpoId));
    }).length;

    return {
      ...stats,
      gpoCoverage,
      uniqueComputers: allComputers.size,
      uniqueUsers: allUsers.size,
      correlatedCount,
    };
  }, [bloodHoundData, report]);

  const totalFindings = summary.findingsList.reduce((a, b) => a + b.count, 0);

  const formatSeverityChips = (severityCounts: Record<string, number>) => {
    const order = ['Black', 'Red', 'Yellow', 'Green', 'Unknown'];
    return order
      .filter(type => severityCounts[type])
      .map(type => (
        <span key={type} className={`policy-status rating-${type.toLowerCase()}`}>
          {severityCounts[type]} {type}
        </span>
      ));
  };

  return (
    <div className="dashboard gpo-dashboard">
      <div className="dashboard-grid">
        {/* Summary stats — full width */}
        <div className="stats-section">
          <div className="stats gpo-stats">
            <div className="stat-card">
              <div className="stat-number">{summary.totalGpos}</div>
              <div className="stat-label">GPOs</div>
              <div className="stat-details">
                <span className="policy-status enabled">{summary.linkedGpos} linked</span>
                {summary.notLinkedGpos > 0 && (
                  <span className="policy-status disabled">{summary.notLinkedGpos} unlinked</span>
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-number">{summary.totalSettings}</div>
              <div className="stat-label">Settings</div>
              <div className="stat-details">
                {summary.computerSettings > 0 && (
                  <span className="policy-status scope-computer">
                    <i className="fas fa-desktop" aria-hidden="true"></i>
                    {summary.computerSettings} computer
                  </span>
                )}
                {summary.userSettings > 0 && (
                  <span className="policy-status scope-user">
                    <i className="fas fa-user" aria-hidden="true"></i>
                    {summary.userSettings} user
                  </span>
                )}
                {summary.otherSettings > 0 && (
                  <span className="policy-status not-configured">
                    {summary.otherSettings} other
                  </span>
                )}
              </div>
            </div>
            <div className="stat-card">
              <div className={`stat-number ${totalFindings === 0 ? 'stat-black' : ''}`}>{totalFindings}</div>
              <div className="stat-label">Findings</div>
              {summary.findingsList.length > 0 && (
                <div className="stat-details">
                  {summary.findingsList.map((f) => (
                    <span key={f.type} className={`policy-status rating-${f.type.toLowerCase()}`}>
                      {f.count} {f.type}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Top GPOs by Findings */}
        <div className="insights-section">
          <h2>Top GPOs by Findings</h2>
          <div className="insights-card compact">
            {summary.gposWithFindings.length > 0 ? (
              <div className="insights-list compact">
                {summary.gposWithFindings.map((gpo, idx) => (
                  <div key={`${gpo.name}-${idx}`} className="insight-item compact">
                    <div className="insight-rank compact">#{idx + 1}</div>
                    <div className="insight-content">
                      <div className="insight-primary compact" title={gpo.name}>{gpo.name}</div>
                      <div className="insight-secondary compact">
                        {gpo.findingsCount} finding{gpo.findingsCount !== 1 ? 's' : ''}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">No findings detected</div>
            )}
          </div>
        </div>

        {/* Top GPOs by Severity */}
        <div className="insights-section">
          <h2>Top GPOs by Severity</h2>
          <div className="insights-card compact">
            {summary.gposBySeverity.length > 0 ? (
              <div className="insights-list compact">
                {summary.gposBySeverity.map((gpo, idx) => (
                  <div key={`${gpo.name}-sev-${idx}`} className="insight-item compact">
                    <div className="insight-rank compact">#{idx + 1}</div>
                    <div className="insight-content">
                      <div className="insight-primary compact" title={gpo.name}>{gpo.name}</div>
                      <div className="insight-secondary compact gpo-severity-row">
                        {Object.keys(gpo.severityCounts).length > 0
                          ? formatSeverityChips(gpo.severityCounts)
                          : <span>Score: {gpo.severityScore}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="no-data">No severity data</div>
            )}
          </div>
        </div>

        {/* BloodHound CTA or coverage */}
        {!bhSummary ? (
          <div className="insights-section gpo-span-2">
            <h2>BloodHound</h2>
            <button type="button" className="gpo-bh-prompt insights-card" onClick={onLoadBloodHound}>
              <i className="fas fa-project-diagram" aria-hidden="true"></i>
              <div className="gpo-bh-prompt-body">
                <strong>Load BloodHound data</strong>
                <span>Map computers, users, and groups affected by each GPO.</span>
              </div>
              <i className="fas fa-chevron-right gpo-bh-arrow" aria-hidden="true"></i>
            </button>
          </div>
        ) : (
          <>
            <div className="stats-section">
              <h2>BloodHound Coverage</h2>
              <div className="stats gpo-stats">
                <div className="stat-card">
                  <div className="stat-number">{bhSummary.correlatedCount}/{summary.totalGpos}</div>
                  <div className="stat-label">GPOs Matched</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{bhSummary.uniqueComputers}</div>
                  <div className="stat-label">Computers</div>
                </div>
                <div className="stat-card">
                  <div className="stat-number">{bhSummary.uniqueUsers}</div>
                  <div className="stat-label">Users</div>
                </div>
              </div>
            </div>

            {bhSummary.gpoCoverage.length > 0 && (
              <div className="insights-section gpo-span-full">
                <h2>GPO Asset Coverage</h2>
                <div className="insights-card compact gpo-coverage-card">
                  <div className="insights-list compact">
                    {bhSummary.gpoCoverage.slice(0, 12).map((gpo, idx) => (
                      <div key={`${gpo.name}-cov-${idx}`} className="insight-item compact">
                        <div className="insight-rank compact">#{idx + 1}</div>
                        <div className="insight-content">
                          <div className="insight-primary compact" title={gpo.name}>
                            {gpo.name}
                            {gpo.isDomainWide && <span className="bh-domain-badge">Domain-wide</span>}
                          </div>
                          <div className="insight-secondary compact gpo-asset-meta">
                            <span><i className="fas fa-desktop" aria-hidden="true"></i> {gpo.computers}</span>
                            <span><i className="fas fa-user" aria-hidden="true"></i> {gpo.users}</span>
                            {gpo.groups > 0 && (
                              <span><i className="fas fa-users" aria-hidden="true"></i> {gpo.groups}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
