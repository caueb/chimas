import { useMemo, useState, useCallback } from 'react';
import { generateBloodHoundQuery, copyToClipboard } from '../utils/bloodhoundQuery';
import { GPOReport } from '../utils/GPOParser';
import {
  Misconfiguration,
  CheckStatus,
  ISSUE_STATUSES,
  CHECK_STATUS_LABELS,
  SECURITY_CATEGORY_LABELS,
} from '../types/Misconfiguration';
import { SEVERITY_ORDER, Severity } from '../utils/constants';
import {
  detectMisconfigurations,
  classifyGPOsBySecurity,
  applyCoverageStatus,
} from '../utils/misconfigDetection';
import { getValueLabel, isSecureValue } from '../utils/valueDefinitions';
import {
  exportMisconfigurationsToCSV,
  exportMisconfigurationsToXLSX,
  MisconfigExportData,
} from '../utils/exporter';
import { Table, TableColumn } from './shared/Table';
import { usePanelLayout, showToast } from './shared';
import { Pagination } from './shared/Pagination';
import { useMisconfigurationState } from '../hooks/useMisconfigurationState';
import type { BloodHoundData, GPOAssetSummary } from '../types/BloodHound';
import { resolveGPOAssets, resolveGPOConflicts } from '../utils/bloodhoundParser';
import './Misconfigurations.css';

interface MisconfigurationsProps {
  report: GPOReport;
  bloodHoundData: BloodHoundData | null;
}

interface CheckImpact {
  insecureComputers: Set<string>;
  secureComputers: Set<string>;
  /** Hosts not covered by a hardening GPO (unverified via GPO). */
  noHardeningComputers: Set<string>;
  scopedTotalComputers: number;
  scopeLabel: string;
  isNotInGpo: boolean;
  conflictWinner: string | null;
}

function BHQueryModal({
  options,
  onClose,
  onCopy,
  copySuccess,
}: {
  options: Array<{ id: string; label: string; description: string; icon: string; query: string }>;
  onClose: () => void;
  onCopy: (query: string) => void;
  copySuccess: boolean;
}) {
  const [selectedOption, setSelectedOption] = useState(options[0]?.id || 'all');
  const activeOption = options.find(o => o.id === selectedOption) || options[0];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bh-query-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>BloodHound Query</h2>
          <button className="modal-close-button" onClick={onClose} aria-label="Close">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          <div className="bh-query-options">
            {options.map(opt => (
              <button
                key={opt.id}
                className={`bh-query-option ${selectedOption === opt.id ? 'active' : ''}`}
                onClick={() => setSelectedOption(opt.id)}
              >
                <i className={`fas ${opt.icon}`}></i>
                <div>
                  <div className="bh-query-option-label">{opt.label}</div>
                  <div className="bh-query-option-desc">{opt.description}</div>
                </div>
              </button>
            ))}
          </div>

          {activeOption && (
            <div className="bh-query-display">
              <div className="bh-query-display-header">
                <span>Cypher Query</span>
                <button
                  className={`bh-copy-list-btn ${copySuccess ? 'copied' : ''}`}
                  onClick={() => onCopy(activeOption.query)}
                  aria-label="Copy query"
                >
                  <i className={`fas ${copySuccess ? 'fa-check' : 'fa-copy'}`}></i>
                  {copySuccess ? 'Copied!' : 'Copy'}
                </button>
              </div>
              <pre className="bh-query-code">{activeOption.query}</pre>
            </div>
          )}

          <div className="bh-query-instructions">
            <strong>Usage:</strong> Copy the query, open BloodHound or Neo4j Browser, and paste to run.
          </div>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: CheckStatus }) {
  return (
    <span className={`sb-status-badge sb-status-${status}`}>
      {CHECK_STATUS_LABELS[status]}
    </span>
  );
}

export function Misconfigurations({ report, bloodHoundData }: MisconfigurationsProps) {
  const {
    selectedIndex,
    setSelectedIndex,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    currentPage,
    setCurrentPage,
    pageSize,
    setPageSize,
    issuesOnly,
    setIssuesOnly,
  } = useMisconfigurationState();

  const [showBloodHoundModal, setShowBloodHoundModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [valuesExpanded, setValuesExpanded] = useState(false);
  const [expandedComputerLists, setExpandedComputerLists] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [showExportDropdown, setShowExportDropdown] = useState(false);

  const toggleComputerList = (key: string) => {
    setExpandedComputerLists(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const copyComputerList = async (names: string[], key: string) => {
    const text = names.sort().join('\n');
    const success = await copyToClipboard(text);
    if (success) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const [panelState, panelActions] = usePanelLayout({ storageKeyPrefix: 'misconfigLayout' });
  const { rightPanelWidthPx, showRightPanel, draggingSide } = panelState;
  const { setShowRightPanel, startDragging } = panelActions;

  const handleCopyQuery = async (query: string) => {
    const success = await copyToClipboard(query);
    if (success) {
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    }
  };

  const baseChecks: Misconfiguration[] = useMemo(() => {
    return detectMisconfigurations(report);
  }, [report]);

  const gpoNameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const gpo of report.gpos) {
      if (gpo.header.gpo && gpo.header.gpoId) {
        map.set(gpo.header.gpo, gpo.header.gpoId);
      }
    }
    return map;
  }, [report.gpos]);

  const gpoNameAssets = useMemo(() => {
    if (!bloodHoundData) return null;
    const map = new Map<string, GPOAssetSummary>();
    for (const gpo of report.gpos) {
      if (!gpo.header.gpoId || !gpo.header.gpo) continue;
      map.set(gpo.header.gpo, resolveGPOAssets(bloodHoundData, gpo.header.gpoId, gpo.header.links));
    }
    return map;
  }, [bloodHoundData, report.gpos]);

  const checkImpact = useMemo(() => {
    if (!bloodHoundData || !gpoNameAssets) return null;

    const allComputerNames = new Set<string>();
    for (const [, c] of bloodHoundData.computers) allComputerNames.add(c.Properties.name);

    const dcComputerNames = new Set<string>();
    const dcOuIds = new Set<string>();
    for (const [ouId, ou] of bloodHoundData.ous) {
      if (/^OU=DOMAIN CONTROLLERS,/i.test(ou.Properties.distinguishedname)) {
        dcOuIds.add(ouId);
      }
    }
    for (const [, c] of bloodHoundData.computers) {
      if (c.ContainedBy && dcOuIds.has(c.ContainedBy.ObjectIdentifier)) {
        dcComputerNames.add(c.Properties.name);
      }
    }

    const map = new Map<string, CheckImpact>();

    for (const check of baseChecks) {
      const { secureGPOs, insecureGPOs } = classifyGPOsBySecurity(check);
      const insecureComputers = new Set<string>();
      const secureComputers = new Set<string>();

      const isDCScope = check.scope === 'domain-controllers';
      const relevantComputers = isDCScope ? dcComputerNames : allComputerNames;
      const scopeLabel = isDCScope ? 'domain controllers' : 'computers';

      for (const gpoName of insecureGPOs) {
        const assets = gpoNameAssets.get(gpoName);
        if (assets) {
          assets.computers.forEach(c => {
            if (relevantComputers.has(c.name)) insecureComputers.add(c.name);
          });
        }
      }

      for (const gpoName of secureGPOs) {
        const assets = gpoNameAssets.get(gpoName);
        if (assets) {
          assets.computers.forEach(c => {
            if (relevantComputers.has(c.name)) secureComputers.add(c.name);
          });
        }
      }

      const conflictComputers = new Set<string>();
      for (const name of insecureComputers) {
        if (secureComputers.has(name)) conflictComputers.add(name);
      }

      let resolvedSecure = new Set(secureComputers);
      let resolvedInsecure = new Set(insecureComputers);
      let conflictWinner: string | null = null;

      if (conflictComputers.size > 0) {
        const allGpoNames = [...secureGPOs, ...insecureGPOs];
        const winnerMap = resolveGPOConflicts(bloodHoundData, allGpoNames, gpoNameToId, report);
        const secureGpoSet = new Set(secureGPOs);

        for (const computerName of conflictComputers) {
          const winningGpo = winnerMap.get(computerName);
          if (winningGpo) {
            if (!conflictWinner) conflictWinner = winningGpo;
            if (secureGpoSet.has(winningGpo)) {
              resolvedInsecure.delete(computerName);
            } else {
              resolvedSecure.delete(computerName);
            }
          }
        }
      }

      const covered = new Set([...resolvedSecure, ...resolvedInsecure]);
      const noHardeningComputers = new Set<string>();
      for (const name of relevantComputers) {
        if (!covered.has(name)) noHardeningComputers.add(name);
      }

      map.set(check.id, {
        insecureComputers: resolvedInsecure,
        secureComputers: resolvedSecure,
        noHardeningComputers,
        scopedTotalComputers: relevantComputers.size,
        scopeLabel,
        isNotInGpo: check.status === 'not_in_gpo',
        conflictWinner,
      });
    }

    return map;
  }, [bloodHoundData, gpoNameAssets, baseChecks, gpoNameToId, report]);

  const checks: Misconfiguration[] = useMemo(() => {
    if (!checkImpact) return baseChecks;
    return baseChecks.map(c => {
      const impact = checkImpact.get(c.id);
      if (!impact) return c;
      return applyCoverageStatus(c, impact.noHardeningComputers.size, true);
    });
  }, [baseChecks, checkImpact]);

  const filteredChecks = useMemo(() => {
    if (!issuesOnly) return checks;
    return checks.filter(c => ISSUE_STATUSES.includes(c.status));
  }, [checks, issuesOnly]);

  const sortedChecks = useMemo(() => {
    return [...filteredChecks].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'severity') {
        comparison = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      } else if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'gpoCount') {
        comparison = a.gpoCount - b.gpoCount;
      } else if (sortField === 'status') {
        comparison = a.status.localeCompare(b.status);
      } else if (sortField === 'category') {
        comparison = a.category.localeCompare(b.category);
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [filteredChecks, sortField, sortDirection, checkImpact]);

  const totalPages = Math.ceil(sortedChecks.length / pageSize) || 1;
  const paginatedData = sortedChecks.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const selectedCheck = selectedIndex !== null ? sortedChecks[selectedIndex] : null;

  const summary = useMemo(() => {
    const issueChecks = checks.filter(c => ISSUE_STATUSES.includes(c.status));
    const bySev = (s: Severity) => issueChecks.filter(c => c.severity === s).length;
    return {
      critical: bySev('critical'),
      high: bySev('high'),
      medium: bySev('medium'),
      low: bySev('low'),
      hardened: checks.filter(c => c.status === 'hardened').length,
      issues: issueChecks.length,
      total: checks.length,
      notInGpo: checks.filter(c => c.status === 'not_in_gpo').length,
    };
  }, [checks]);

  const handleSort = (field: string) => {
    const typedField = field as typeof sortField;
    if (typedField === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(typedField);
      setSortDirection(typedField === 'name' || typedField === 'category' || typedField === 'status' ? 'asc' : 'asc');
    }
  };

  const handleSelectItem = (item: Misconfiguration) => {
    const index = sortedChecks.indexOf(item);
    setSelectedIndex(index);
    setShowRightPanel(true);
    setValuesExpanded(false);
  };

  const handleCloseRightPanel = () => {
    setShowRightPanel(false);
    setSelectedIndex(null);
  };

  const buildExportData = useCallback((): MisconfigExportData[] => {
    return sortedChecks.map(m => {
      const assetData = checkImpact?.get(m.id);
      const gpoDetails = Object.entries(m.gposByValue)
        .filter(([v]) => v !== '(Default)')
        .map(([v, gpos]) => `Value ${v}: ${gpos.join(', ')}`)
        .join(' | ');

      return {
        misconfig: m,
        secureComputers: assetData?.secureComputers.size ?? 0,
        secureUsers: 0,
        insecureComputers: assetData?.insecureComputers.size ?? 0,
        insecureUsers: 0,
        unprotectedComputers: assetData?.noHardeningComputers.size ?? 0,
        unprotectedComputerNames: assetData ? Array.from(assetData.noHardeningComputers) : [],
        unprotectedUsers: 0,
        totalComputers: assetData?.scopedTotalComputers ?? 0,
        totalUsers: 0,
        isDefault: m.status === 'not_in_gpo',
        gpoDetails: gpoDetails || (m.status === 'not_in_gpo' ? 'Not configured via GPO' : ''),
      };
    });
  }, [sortedChecks, checkImpact]);

  const columns: TableColumn<Misconfiguration>[] = [
    {
      key: 'severity',
      header: 'Severity',
      sortable: true,
      render: item => (
        <span className={`severity-badge severity-${item.severity}`}>
          {item.severity.toUpperCase()}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Check',
      sortable: true,
      render: item => (
        <div className="sb-check-cell">
          <span className="sb-check-name">{item.name}</span>
          {item.scope === 'domain-controllers' && (
            <span className="sb-scope-chip" title="Applies to domain controllers">DC</span>
          )}
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      render: item => <StatusBadge status={item.status} />,
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      render: item => (
        <span className="sb-category-chip">{SECURITY_CATEGORY_LABELS[item.category]}</span>
      ),
    },
    {
      key: 'gpoCount',
      header: 'GPOs',
      sortable: true,
      render: item => item.gpoCount,
    },
  ];

  return (
    <div className="main-content misconfigurations-view security-baseline-view">
      <div
        className={`center-panel expanded ${showRightPanel ? 'with-right-panel' : ''}`}
        style={{
          left: 0,
          right: showRightPanel ? rightPanelWidthPx : 0,
        }}
      >
        <div className="table-container">
          <div className="table-header">
            <div className="table-header-content">
              <div className="findings-header">
                <h2>Security Baseline</h2>
                <div className="sb-summary-strip" aria-label="Baseline summary">
                  <span className="sb-sum-chip critical" title="Critical issues">
                    {summary.critical} Crit
                  </span>
                  <span className="sb-sum-chip high" title="High issues">
                    {summary.high} High
                  </span>
                  <span className="sb-sum-chip medium" title="Medium issues">
                    {summary.medium} Med
                  </span>
                  <span className="sb-sum-chip low" title="Low issues">
                    {summary.low} Low
                  </span>
                  <span className="sb-sum-chip hardened" title="Fully hardened via GPO">
                    {summary.hardened} Hardened
                  </span>
                  {summary.notInGpo > 0 && (
                    <span className="sb-sum-chip not-in-gpo" title="Not configured via GPO">
                      {summary.notInGpo} Not in GPO
                    </span>
                  )}
                </div>
              </div>
              <div className="table-controls">
                <label className="sb-toggle" title="Hide checks that are fully hardened via GPO">
                  <input
                    type="checkbox"
                    checked={issuesOnly}
                    onChange={e => setIssuesOnly(e.target.checked)}
                  />
                  <span>Issues only</span>
                </label>
                <div className="export-dropdown-container">
                  <button
                    className="action-button dropdown-button"
                    onClick={() => setShowExportDropdown(!showExportDropdown)}
                    disabled={sortedChecks.length === 0}
                    title="Export security baseline report"
                    type="button"
                  >
                    <i className="fas fa-download button-icon"></i>
                    Export
                    <i className="fas fa-chevron-down dropdown-arrow"></i>
                  </button>
                  {showExportDropdown && (
                    <div className="export-dropdown-menu">
                      <button
                        className="export-dropdown-item"
                        type="button"
                        onClick={() => {
                          exportMisconfigurationsToCSV(buildExportData());
                          setShowExportDropdown(false);
                          showToast('CSV export complete', 'success');
                        }}
                      >
                        <i className="fas fa-file-csv"></i>
                        Export CSV
                      </button>
                      <button
                        className="export-dropdown-item"
                        type="button"
                        onClick={async () => {
                          await exportMisconfigurationsToXLSX(buildExportData());
                          setShowExportDropdown(false);
                          showToast('XLSX export complete', 'success');
                        }}
                      >
                        <i className="fas fa-file-excel"></i>
                        Export XLSX
                      </button>
                    </div>
                  )}
                </div>
                <div className="results-count">
                  {sortedChecks.length} of {checks.length}
                </div>
              </div>
            </div>

          </div>

          {sortedChecks.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-check-circle"></i>
              <p>
                {checks.length === 0
                  ? 'No baseline checks available'
                  : issuesOnly
                    ? 'No issues — all checks are hardened via GPO'
                    : 'No baseline checks to display'}
              </p>
              <p className="empty-subtext">
                {issuesOnly
                  ? 'Turn off “Issues only” to review the full security baseline.'
                  : 'Load Group3r data to populate the security baseline.'}
              </p>
            </div>
          ) : (
            <div className="findings-list">
              <Table
                data={paginatedData}
                columns={columns}
                sortField={sortField}
                sortDirection={sortDirection}
                onSort={handleSort}
                selectedItem={selectedCheck}
                onSelectItem={handleSelectItem}
                getRowKey={item => item.id}
              />
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalResults={sortedChecks.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[10, 20, 50]}
              />
            </div>
          )}
        </div>
      </div>

      <div
        className={`resizer resizer-right ${showRightPanel ? '' : 'hidden'} ${draggingSide === 'right' ? 'dragging' : ''}`}
        style={{ right: rightPanelWidthPx }}
        onMouseDown={e => {
          e.preventDefault();
          startDragging('right');
        }}
      />

      {showRightPanel && selectedCheck && (
        <div className="right-panel" style={{ width: rightPanelWidthPx }}>
          <div className="panel-header">
            <h3>{selectedCheck.name}</h3>
            <button className="close-button" onClick={handleCloseRightPanel} aria-label="Close details">
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="panel-content">
            <div className="mc-details">
              <div className="mc-section">
                <div className="sb-verdict-row">
                  <span className={`severity-badge severity-${selectedCheck.severity}`}>
                    {selectedCheck.severity.toUpperCase()}
                  </span>
                  <StatusBadge status={selectedCheck.status} />
                  <span className="sb-category-chip">
                    {SECURITY_CATEGORY_LABELS[selectedCheck.category]}
                  </span>
                  {selectedCheck.scope === 'domain-controllers' && (
                    <span className="sb-scope-chip">Domain Controllers</span>
                  )}
                </div>
                <p className="sb-verdict">{selectedCheck.verdict}</p>
              </div>

              <div className="mc-section">
                <div className="mc-section-label">Why it matters</div>
                <p className="mc-description">{selectedCheck.abuseSummary}</p>
                <p className="mc-description sb-muted">{selectedCheck.description}</p>
              </div>

              {selectedCheck.status === 'not_in_gpo' && (
                <div className="mc-section sb-caveat">
                  <div className="mc-section-label">
                    <i className="fas fa-exclamation-circle"></i> Not configured via GPO
                  </div>
                  <p>
                    Windows default: <strong>{selectedCheck.windowsDefault.valueLabel}</strong>
                    {selectedCheck.windowsDefault.isInsecure ? ' (insecure if unmanaged)' : ''}.
                  </p>
                  {selectedCheck.windowsDefault.notes && (
                    <p className="sb-muted">{selectedCheck.windowsDefault.notes}</p>
                  )}
                  <p className="sb-caveat-text">
                    Absence from Group Policy does <strong>not</strong> prove the estate is vulnerable.
                    The setting may be enforced by Intune, SCCM/MECM, DSC, local policy, or image baselines.
                    Treat this as <em>unverified via GPO</em> and validate on endpoints or other management planes.
                  </p>
                </div>
              )}

              <div className="mc-section">
                <div className="mc-section-label">GPO evidence</div>
                <div className="mc-subsection">
                  <div className="mc-section-label">Registry Path</div>
                  <code className="mc-registry-path">{selectedCheck.registryPath}</code>
                </div>
                {selectedCheck.policyPath && (
                  <div className="mc-subsection">
                    <div className="mc-section-label">Policy path</div>
                    <p className="sb-policy-path">{selectedCheck.policyPath}</p>
                  </div>
                )}

                {selectedCheck.possibleValues && selectedCheck.possibleValues.length > 0 && (
                  <div className="mc-subsection">
                    <div
                      className="mc-section-toggle"
                      onClick={() => setValuesExpanded(!valuesExpanded)}
                    >
                      <i className={`fas fa-chevron-${valuesExpanded ? 'down' : 'right'} mc-toggle-icon`}></i>
                      <span className="mc-section-label">Possible values</span>
                      <span className="mc-section-count">{selectedCheck.possibleValues.length}</span>
                    </div>
                    {valuesExpanded && (
                      <div className="mc-values-table">
                        {selectedCheck.possibleValues.map(pv => (
                          <div key={pv.value} className="mc-values-row">
                            <span className="mc-values-val">{pv.value}</span>
                            <span className="mc-values-meaning">{pv.label}</span>
                            <span className={`mc-values-security ${pv.isSecure ? 'secure' : 'insecure'}`}>
                              <i className={`fas ${pv.isSecure ? 'fa-check' : 'fa-times'}`}></i>
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                <div className="mc-subsection">
                  <div className="mc-section-label">Configured values</div>
                  {Object.entries(selectedCheck.gposByValue).length > 0 ? (
                    Object.entries(selectedCheck.gposByValue)
                      .sort(([a], [b]) => a.localeCompare(b))
                      .map(([value, gpos]) => {
                        const isDefault = value === '(Default)';
                        const secure = !isDefault && isSecureValue(selectedCheck.id, value);
                        const label = getValueLabel(selectedCheck.id, value);

                        return (
                          <div key={value} className="value-group">
                            <h5 className="value-label value-label-inline">
                              <span className="value-label-text">
                                {isDefault ? 'Default' : `Value: ${value}`}
                              </span>
                              <span className="value-label-meaning">({label})</span>
                              {!isDefault && (
                                <span className={`value-group-indicator ${secure ? 'secure' : 'insecure'}`}>
                                  <i className={`fas ${secure ? 'fa-check' : 'fa-exclamation'}`}></i>
                                  {secure ? 'Secure' : 'Insecure'}
                                </span>
                              )}
                            </h5>
                            <ul className="gpo-list">
                              {gpos.map((gpo, i) => {
                                const assets = gpoNameAssets?.get(gpo);
                                const computerNames = assets?.computers.map(c => c.name) ?? [];
                                const listKey = `gpo-${value}-${i}`;
                                const isExpanded = expandedComputerLists.has(listKey);
                                return (
                                  <li key={i} className="gpo-list-item-with-expand">
                                    <div className="gpo-list-item-header">
                                      {gpo}
                                      {computerNames.length > 0 && (
                                        <button
                                          className="bh-expand-computers"
                                          type="button"
                                          onClick={() => toggleComputerList(listKey)}
                                          title={isExpanded ? 'Hide computers' : 'Show computers'}
                                        >
                                          <i className="fas fa-desktop"></i> {computerNames.length}
                                          <i className={`fas fa-chevron-${isExpanded ? 'up' : 'down'}`}></i>
                                        </button>
                                      )}
                                    </div>
                                    {isExpanded && computerNames.length > 0 && (
                                      <div className="bh-computer-expand-list">
                                        <div className="bh-computer-expand-header">
                                          <span>Computers ({computerNames.length})</span>
                                          <button
                                            className="bh-copy-list-btn"
                                            type="button"
                                            onClick={() => copyComputerList(computerNames, listKey)}
                                            aria-label="Copy computer list"
                                          >
                                            <i className={`fas ${copiedKey === listKey ? 'fa-check' : 'fa-copy'}`}></i>
                                            {copiedKey === listKey ? 'Copied' : 'Copy'}
                                          </button>
                                        </div>
                                        <div className="bh-computer-expand-names">
                                          {computerNames.sort().map((name, ci) => (
                                            <div key={ci} className="bh-computer-expand-name">
                                              {name}
                                            </div>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </li>
                                );
                              })}
                            </ul>
                          </div>
                        );
                      })
                  ) : (
                    <p className="no-items">No GPOs configure this setting</p>
                  )}
                </div>
              </div>

              {checkImpact &&
                (() => {
                  const assetData = checkImpact.get(selectedCheck.id);
                  if (!assetData) return null;

                  const insecureNames = Array.from(assetData.insecureComputers).sort();
                  const secureNames = Array.from(assetData.secureComputers).sort();
                  const noHardeningNames = Array.from(assetData.noHardeningComputers).sort();
                  const totalComp = assetData.scopedTotalComputers;
                  const scopeLabel = assetData.scopeLabel;

                  const insecureKey = `insecure-${selectedCheck.id}`;
                  const secureKey = `secure-${selectedCheck.id}`;
                  const noHardKey = `nohard-${selectedCheck.id}`;

                  return (
                    <div className="mc-section">
                      <div className="mc-section-label">
                        Host coverage ({scopeLabel === 'domain controllers' ? 'Domain Controllers' : 'Computers'})
                      </div>
                      <div className="bh-misconfig-summary">
                        {assetData.conflictWinner && (
                          <div className="bh-misconfig-group conflict">
                            <div className="bh-misconfig-group-header">
                              <i className="fas fa-layer-group"></i>
                              GPO precedence resolved
                            </div>
                            <div className="bh-misconfig-note">
                              Multiple GPOs configure this setting on the same {scopeLabel}. Based on link
                              order, <strong>{assetData.conflictWinner}</strong> takes precedence on conflicting hosts.
                            </div>
                          </div>
                        )}

                        {insecureNames.length > 0 && (
                          <div className="bh-misconfig-group unprotected">
                            <div className="bh-misconfig-group-header">
                              <i className="fas fa-exclamation-triangle"></i>
                              Insecure GPO — {insecureNames.length}/{totalComp} {scopeLabel}
                              <button
                                className="bh-expand-computers"
                                type="button"
                                onClick={() => toggleComputerList(insecureKey)}
                              >
                                <i className={`fas fa-chevron-${expandedComputerLists.has(insecureKey) ? 'up' : 'down'}`}></i>
                              </button>
                            </div>
                            <div className="bh-misconfig-note">
                              Strong evidence: hosts linked to GPO(s) setting an insecure value.
                            </div>
                            {expandedComputerLists.has(insecureKey) && (
                              <div className="bh-computer-expand-list">
                                <div className="bh-computer-expand-header">
                                  <span>{insecureNames.length} computers</span>
                                  <button
                                    className="bh-copy-list-btn"
                                    type="button"
                                    onClick={() => copyComputerList(insecureNames, insecureKey)}
                                  >
                                    <i className={`fas ${copiedKey === insecureKey ? 'fa-check' : 'fa-copy'}`}></i>
                                    {copiedKey === insecureKey ? 'Copied' : 'Copy'}
                                  </button>
                                </div>
                                <div className="bh-computer-expand-names">
                                  {insecureNames.map((name, ci) => (
                                    <div key={ci} className="bh-computer-expand-name">
                                      {name}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {noHardeningNames.length > 0 && (
                          <div className="bh-misconfig-group review">
                            <div className="bh-misconfig-group-header">
                              <i className="fas fa-question-circle"></i>
                              No hardening GPO — {noHardeningNames.length}/{totalComp} {scopeLabel}
                              <button
                                className="bh-expand-computers"
                                type="button"
                                onClick={() => toggleComputerList(noHardKey)}
                              >
                                <i className={`fas fa-chevron-${expandedComputerLists.has(noHardKey) ? 'up' : 'down'}`}></i>
                              </button>
                            </div>
                            <div className="bh-misconfig-note">
                              Unverified via GPO — not covered by a hardening GPO in this dataset.
                              May still be secured by Intune, SCCM, local policy, or image baseline.
                              {selectedCheck.windowsDefault.isInsecure &&
                                ' Windows default is insecure if truly unmanaged.'}
                            </div>
                            {expandedComputerLists.has(noHardKey) && (
                              <div className="bh-computer-expand-list">
                                <div className="bh-computer-expand-header">
                                  <span>{noHardeningNames.length} computers</span>
                                  <button
                                    className="bh-copy-list-btn"
                                    type="button"
                                    onClick={() => copyComputerList(noHardeningNames, noHardKey)}
                                  >
                                    <i className={`fas ${copiedKey === noHardKey ? 'fa-check' : 'fa-copy'}`}></i>
                                    {copiedKey === noHardKey ? 'Copied' : 'Copy'}
                                  </button>
                                </div>
                                <div className="bh-computer-expand-names">
                                  {noHardeningNames.map((name, ci) => (
                                    <div key={ci} className="bh-computer-expand-name">
                                      {name}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}

                        {secureNames.length > 0 && (
                          <div className="bh-misconfig-group secure">
                            <div className="bh-misconfig-group-header">
                              <i className="fas fa-check-circle"></i>
                              Hardening GPO — {secureNames.length}/{totalComp} {scopeLabel}
                              <button
                                className="bh-expand-computers"
                                type="button"
                                onClick={() => toggleComputerList(secureKey)}
                              >
                                <i className={`fas fa-chevron-${expandedComputerLists.has(secureKey) ? 'up' : 'down'}`}></i>
                              </button>
                            </div>
                            {expandedComputerLists.has(secureKey) && (
                              <div className="bh-computer-expand-list">
                                <div className="bh-computer-expand-header">
                                  <span>{secureNames.length} computers</span>
                                  <button
                                    className="bh-copy-list-btn"
                                    type="button"
                                    onClick={() => copyComputerList(secureNames, secureKey)}
                                  >
                                    <i className={`fas ${copiedKey === secureKey ? 'fa-check' : 'fa-copy'}`}></i>
                                    {copiedKey === secureKey ? 'Copied' : 'Copy'}
                                  </button>
                                </div>
                                <div className="bh-computer-expand-names">
                                  {secureNames.map((name, ci) => (
                                    <div key={ci} className="bh-computer-expand-name">
                                      {name}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}

              <div className="mc-section">
                <div className="mc-section-label">Remediation</div>
                <p>
                  Recommended: <strong>{selectedCheck.recommendedValue}</strong>
                </p>
                {selectedCheck.policyPath && (
                  <p className="sb-muted">{selectedCheck.policyPath}</p>
                )}
                <p className="sb-muted">
                  After changing GPOs, confirm effective policy on sample hosts and re-check coverage
                  with BloodHound if available.
                </p>
              </div>

              <div className="mc-section mc-section-actions">
                <button
                  className="mc-bh-query-btn"
                  type="button"
                  onClick={() => setShowBloodHoundModal(true)}
                  title="Generate BloodHound query"
                >
                  <i className="fas fa-code"></i>
                  Generate BloodHound Query
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showBloodHoundModal &&
        selectedCheck &&
        (() => {
          const { secureGPOs, insecureGPOs } = classifyGPOsBySecurity(selectedCheck);
          const queryOptions: Array<{
            id: string;
            label: string;
            description: string;
            icon: string;
            query: string;
          }> = [];

          if (insecureGPOs.length > 0) {
            queryOptions.push({
              id: 'insecure',
              label: 'Hosts under insecure GPO value(s)',
              description: `Enabled computers affected by GPOs that set an insecure value for ${selectedCheck.name}.`,
              icon: 'fa-exclamation-triangle',
              query: generateBloodHoundQuery([], insecureGPOs),
            });
          }

          if (secureGPOs.length > 0) {
            queryOptions.push({
              id: 'no-hardening',
              label: 'Hosts not covered by hardening GPO(s)',
              description: `Enabled computers NOT covered by GPOs that harden ${selectedCheck.name}. Unverified via GPO — may still be enforced elsewhere.`,
              icon: 'fa-question-circle',
              query: generateBloodHoundQuery(secureGPOs, []),
            });
          }

          queryOptions.push({
            id: 'all',
            label: 'All enabled computers',
            description: 'Return all enabled computers in the domain.',
            icon: 'fa-desktop',
            query: generateBloodHoundQuery([], []),
          });

          return (
            <BHQueryModal
              options={queryOptions}
              onClose={() => setShowBloodHoundModal(false)}
              onCopy={handleCopyQuery}
              copySuccess={copySuccess}
            />
          );
        })()}
    </div>
  );
}
