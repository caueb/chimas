import { useMemo, useState, useCallback } from 'react';
import { generateBloodHoundQuery, copyToClipboard } from '../utils/bloodhoundQuery';
import { GPOReport } from '../utils/GPOParser';
import { Misconfiguration } from '../types/Misconfiguration';
import { SEVERITY_COLORS, SEVERITY_ORDER } from '../utils/constants';
import { detectMisconfigurations } from '../utils/misconfigDetection';
import { exportMisconfigurationsToCSV, exportMisconfigurationsToXLSX, MisconfigExportData } from '../utils/exporter';
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

// Classify GPOs into secure (hardening) and insecure for BloodHound query generation
function classifyGPOs(misconfig: Misconfiguration): { secureGPOs: string[]; insecureGPOs: string[] } {
  const securePatterns: Record<string, string[]> = {
    'smbv1-server': ['0'],
    'smbv1-client': ['4'],
    'llmnr': ['0'],
    'ipv6': ['1', '16', '17', '32', '255'],
    'cached-credentials': ['0', '1', '2'],
    'smb-signing-server': ['1'],
    'smb-signing-client': ['1'],
    'no-lm-hash': ['1'],
    'lm-compatibility-level': ['5'],
    'ntlm-min-client-sec': ['0x20080000'],
    'ntlm-min-server-sec': ['0x20080000'],
    'netbios': ['2'],              // 2 = disabled
    'mdns': ['0'],                 // 0 = disabled
    'ldap-client-signing': ['2'],  // 2 = require signing
    'ldap-server-signing': ['2'],  // 2 = require signing
    'ldap-channel-binding': ['2'], // 2 = always required
  };

  const patterns = securePatterns[misconfig.id] || [];
  const secureGPOs: string[] = [];
  const insecureGPOs: string[] = [];

  for (const [value, gpos] of Object.entries(misconfig.gposByValue)) {
    // Skip synthetic default entries — they're not real GPOs
    if (value === '(Default)') continue;
    const isSecure = patterns.some(p => value === p || value.startsWith(p));
    if (isSecure) {
      secureGPOs.push(...gpos);
    } else {
      insecureGPOs.push(...gpos);
    }
  }

  return { secureGPOs, insecureGPOs };
}

function BHQueryModal({ options, onClose, onCopy, copySuccess }: {
  options: Array<{ id: string; label: string; description: string; icon: string; query: string }>;
  onClose: () => void;
  onCopy: (query: string) => void;
  copySuccess: boolean;
}) {
  const [selectedOption, setSelectedOption] = useState(options[0]?.id || 'all');
  const activeOption = options.find(o => o.id === selectedOption) || options[0];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bh-query-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>BloodHound Query</h2>
          <button className="modal-close-button" onClick={onClose} aria-label="Close">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          {/* Query type selector */}
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

          {/* Query display */}
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
  } = useMisconfigurationState();

  const [showBloodHoundModal, setShowBloodHoundModal] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [valuesExpanded, setValuesExpanded] = useState(false);
  const [expandedComputerLists, setExpandedComputerLists] = useState<Set<string>>(new Set());
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

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

  // Panel layout for right panel (details)
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

  // Run detection functions on the GPO report
  const misconfigurations: Misconfiguration[] = useMemo(() => {
    return detectMisconfigurations(report);
  }, [report]);

  // Build a map of GPO name -> gpoId for lookup
  const gpoNameToId = useMemo(() => {
    const map = new Map<string, string>();
    for (const gpo of report.gpos) {
      if (gpo.header.gpo && gpo.header.gpoId) {
        map.set(gpo.header.gpo, gpo.header.gpoId);
      }
    }
    return map;
  }, [report.gpos]);

  // Build a map of GPO name -> resolved assets for BloodHound enrichment
  const gpoNameAssets = useMemo(() => {
    if (!bloodHoundData) return null;
    const map = new Map<string, GPOAssetSummary>();
    for (const gpo of report.gpos) {
      if (!gpo.header.gpoId || !gpo.header.gpo) continue;
      map.set(gpo.header.gpo, resolveGPOAssets(bloodHoundData, gpo.header.gpoId, gpo.header.links));
    }
    return map;
  }, [bloodHoundData, report.gpos]);

  // Resolve per-misconfiguration asset summary
  // Secure = covered by hardening GPO, Insecure = covered by misconfigured GPO, Unprotected = no GPO
  const misconfigAssets = useMemo(() => {
    if (!bloodHoundData || !gpoNameAssets) return null;

    // Build set of all domain computer names
    const allComputerNames = new Set<string>();
    for (const [, c] of bloodHoundData.computers) allComputerNames.add(c.Properties.name);

    // Build set of DC-only computer names (computers in Domain Controllers OU)
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

    const map = new Map<string, {
      insecureComputers: Set<string>;
      secureComputers: Set<string>;
      unprotectedComputers: Set<string>;
      scopedTotalComputers: number;
      scopeLabel: string;
      isDefault: boolean;
      conflictWinner: string | null;
    }>();

    for (const misconfig of misconfigurations) {
      const { secureGPOs, insecureGPOs } = classifyGPOs(misconfig);
      const insecureComputers = new Set<string>();
      const secureComputers = new Set<string>();

      // Determine the relevant computer universe based on scope
      const isDCScope = misconfig.scope === 'domain-controllers';
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

      // Resolve conflicts: computers that have both secure and insecure GPOs
      // Use GPO link order precedence to determine the winner
      const conflictComputers = new Set<string>();
      for (const name of insecureComputers) {
        if (secureComputers.has(name)) conflictComputers.add(name);
      }

      let resolvedSecure = secureComputers;
      let resolvedInsecure = insecureComputers;
      let conflictWinner: string | null = null;

      if (conflictComputers.size > 0 && bloodHoundData) {
        // All GPO names involved in this misconfig
        const allGpoNames = [...secureGPOs, ...insecureGPOs];
        const winnerMap = resolveGPOConflicts(bloodHoundData, allGpoNames, gpoNameToId, report);

        // Reclassify conflicting computers based on winner
        resolvedSecure = new Set(secureComputers);
        resolvedInsecure = new Set(insecureComputers);
        const secureGpoSet = new Set(secureGPOs);

        for (const computerName of conflictComputers) {
          const winningGpo = winnerMap.get(computerName);
          if (winningGpo) {
            if (!conflictWinner) conflictWinner = winningGpo;
            if (secureGpoSet.has(winningGpo)) {
              // Secure GPO wins — remove from insecure
              resolvedInsecure.delete(computerName);
            } else {
              // Insecure GPO wins — remove from secure
              resolvedSecure.delete(computerName);
            }
          }
          // If no winner found, leave in both (unresolvable)
        }
      }

      // Unprotected = scoped computers minus those covered by ANY GPO
      const coveredComputers = new Set([...resolvedSecure, ...resolvedInsecure]);
      const unprotectedComputers = new Set<string>();
      for (const name of relevantComputers) {
        if (!coveredComputers.has(name)) unprotectedComputers.add(name);
      }

      const isDefault = misconfig.gpoCount === 0;

      map.set(misconfig.id, {
        insecureComputers: resolvedInsecure,
        secureComputers: resolvedSecure,
        unprotectedComputers,
        scopedTotalComputers: relevantComputers.size,
        scopeLabel,
        isDefault,
        conflictWinner,
      });
    }

    return map;
  }, [bloodHoundData, gpoNameAssets, misconfigurations]);

  // Sort misconfigurations
  const sortedMisconfigs = useMemo(() => {
    return [...misconfigurations].sort((a, b) => {
      let comparison = 0;
      if (sortField === 'severity') {
        comparison = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
      } else if (sortField === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortField === 'gpoCount') {
        comparison = a.gpoCount - b.gpoCount;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [misconfigurations, sortField, sortDirection]);

  // Pagination
  const totalPages = Math.ceil(sortedMisconfigs.length / pageSize) || 1;
  const paginatedData = sortedMisconfigs.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize
  );

  const selectedMisconfig = selectedIndex !== null ? sortedMisconfigs[selectedIndex] : null;

  const handleSort = (field: string) => {
    const typedField = field as typeof sortField;
    if (typedField === sortField) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(typedField);
      setSortDirection('asc');
    }
  };

  const handleSelectItem = (item: Misconfiguration) => {
    const index = sortedMisconfigs.indexOf(item);
    setSelectedIndex(index);
    setShowRightPanel(true);
  };

  const handleCloseRightPanel = () => {
    setShowRightPanel(false);
    setSelectedIndex(null);
  };

  // Helper to get value label from possibleValues
  const getValueInfo = (misconfig: Misconfiguration, value: string) => {
    if (!misconfig.possibleValues) return null;
    return misconfig.possibleValues.find(pv => pv.value === value);
  };

  // Build export data
  const buildExportData = useCallback((): MisconfigExportData[] => {
    return sortedMisconfigs.map(m => {
      const assetData = misconfigAssets?.get(m.id);
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
        unprotectedComputers: assetData?.unprotectedComputers.size ?? 0,
        unprotectedComputerNames: assetData ? Array.from(assetData.unprotectedComputers) : [],
        unprotectedUsers: 0,
        totalComputers: assetData?.scopedTotalComputers ?? 0,
        totalUsers: 0,
        isDefault: assetData?.isDefault ?? (m.gpoCount === 0),
        gpoDetails: gpoDetails || (m.gpoCount === 0 ? 'No GPO (Windows Default)' : ''),
      };
    });
  }, [sortedMisconfigs, misconfigAssets]);

  const [showExportDropdown, setShowExportDropdown] = useState(false);

  const columns: TableColumn<Misconfiguration>[] = [
    {
      key: 'severity',
      header: 'Severity',
      sortable: true,
      render: (item) => (
        <span
          className="severity-badge"
          style={{
            backgroundColor: SEVERITY_COLORS[item.severity].badge,
            color: SEVERITY_COLORS[item.severity].text,
          }}
        >
          {item.severity.toUpperCase()}
        </span>
      ),
    },
    {
      key: 'name',
      header: 'Misconfiguration',
      sortable: true,
      render: (item) => item.name,
    },
    {
      key: 'gpoCount',
      header: 'GPOs',
      sortable: true,
      render: (item) => item.gpoCount,
    },
  ];

  return (
    <div className="main-content misconfigurations-view">
      {/* Center Panel - Main Table (no left panel for filters in this view) */}
      <div
        className={`center-panel expanded ${showRightPanel ? 'with-right-panel' : ''}`}
        style={{
          left: 0,
          right: showRightPanel ? rightPanelWidthPx : 0
        }}
      >
        <div className="table-container">
          <div className="table-header">
            <div className="table-header-content">
              <div className="findings-header">
                <h2>Security Misconfigurations</h2>
              </div>
              <div className="table-controls">
                <div className="export-dropdown-container">
                  <button
                    className="action-button dropdown-button"
                    onClick={() => setShowExportDropdown(!showExportDropdown)}
                    disabled={sortedMisconfigs.length === 0}
                    title="Export misconfigurations report"
                  >
                    <i className="fas fa-download button-icon"></i>
                    Export
                    <i className="fas fa-chevron-down dropdown-arrow"></i>
                  </button>
                  {showExportDropdown && (
                    <div className="export-dropdown-menu">
                      <button
                        className="export-dropdown-item"
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
                  {sortedMisconfigs.length} items
                </div>
              </div>
            </div>
          </div>

          {misconfigurations.length === 0 ? (
            <div className="empty-state">
              <i className="fas fa-check-circle"></i>
              <p>No misconfigurations detected</p>
              <p className="empty-subtext">
                All checked security settings appear to be configured securely
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
                selectedItem={selectedMisconfig}
                onSelectItem={handleSelectItem}
                getRowKey={(item) => item.id}
              />
              <Pagination
                currentPage={currentPage}
                totalPages={totalPages}
                pageSize={pageSize}
                totalResults={sortedMisconfigs.length}
                onPageChange={setCurrentPage}
                onPageSizeChange={setPageSize}
                pageSizeOptions={[10, 20, 50]}
              />
            </div>
          )}
        </div>
      </div>

      {/* Right Resizer */}
      <div
        className={`resizer resizer-right ${showRightPanel ? '' : 'hidden'} ${draggingSide === 'right' ? 'dragging' : ''}`}
        style={{ right: rightPanelWidthPx }}
        onMouseDown={(e) => { e.preventDefault(); startDragging('right'); }}
      />

      {/* Right Panel - Details */}
      {showRightPanel && selectedMisconfig && (
        <div className="right-panel" style={{ width: rightPanelWidthPx }}>
          <div className="panel-header">
            <h3>{selectedMisconfig.name}</h3>
            <button className="close-button" onClick={handleCloseRightPanel} aria-label="Close details">
              <i className="fas fa-times"></i>
            </button>
          </div>
          <div className="panel-content">
            <div className="mc-details">
              {/* Setting Details: Description + Registry Path + Possible Values */}
              <div className="mc-section">
                <p className="mc-description">{selectedMisconfig.description}</p>

                <div className="mc-subsection">
                  <div className="mc-section-label">Registry Path</div>
                  <code className="mc-registry-path">{selectedMisconfig.registryPath}</code>
                </div>

                {selectedMisconfig.possibleValues && selectedMisconfig.possibleValues.length > 0 && (
                  <div className="mc-subsection">
                    <div
                      className="mc-section-toggle"
                      onClick={() => setValuesExpanded(!valuesExpanded)}
                    >
                      <i className={`fas fa-chevron-${valuesExpanded ? 'down' : 'right'} mc-toggle-icon`}></i>
                      <span className="mc-section-label">Possible Values</span>
                      <span className="mc-section-count">{selectedMisconfig.possibleValues.length}</span>
                    </div>
                    {valuesExpanded && (
                      <div className="mc-values-table">
                        {selectedMisconfig.possibleValues.map((pv) => (
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
              </div>

              {/* GPOs by Value */}
              <div className="mc-section">
                <div className="mc-section-label">GPOs by Configured Value</div>
                {Object.entries(selectedMisconfig.gposByValue).length > 0 ? (
                  Object.entries(selectedMisconfig.gposByValue)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([value, gpos]) => {
                      const valueInfo = getValueInfo(selectedMisconfig, value);
                      // If no exact match in possibleValues, determine security from classifyGPOs patterns
                      const { secureGPOs: secGpos } = classifyGPOs(selectedMisconfig);
                      const isValueSecure = valueInfo
                        ? valueInfo.isSecure
                        : value !== '(Default)' && gpos.some(g => secGpos.includes(g));

                      return (
                        <div key={value} className="value-group">
                          <h5 className="value-label value-label-inline">
                            <span className="value-label-text">Value: {value}</span>
                            {valueInfo && (
                              <span className="value-label-meaning">({valueInfo.label})</span>
                            )}
                            {value !== '(Default)' && (
                              <span className={`value-group-indicator ${isValueSecure ? 'secure' : 'insecure'}`}>
                                <i className={`fas ${isValueSecure ? 'fa-check' : 'fa-exclamation'}`}></i>
                                {isValueSecure ? 'Secure' : 'Risk'}
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
                                          onClick={() => copyComputerList(computerNames, listKey)}
                                          aria-label="Copy computer list"
                                        >
                                          <i className={`fas ${copiedKey === listKey ? 'fa-check' : 'fa-copy'}`}></i>
                                          {copiedKey === listKey ? 'Copied' : 'Copy'}
                                        </button>
                                      </div>
                                      <div className="bh-computer-expand-names">
                                        {computerNames.sort().map((name, ci) => (
                                          <div key={ci} className="bh-computer-expand-name">{name}</div>
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

              {/* Affected Computers */}
              {misconfigAssets && (() => {
                const assetData = misconfigAssets.get(selectedMisconfig.id);
                if (!assetData) return null;

                const { insecureGPOs } = classifyGPOs(selectedMisconfig);
                const atRiskComputers = new Set([...assetData.insecureComputers, ...assetData.unprotectedComputers]);
                const securedCount = assetData.secureComputers.size;
                const atRiskCount = atRiskComputers.size;
                const totalComp = assetData.scopedTotalComputers;
                const scopeLabel = assetData.scopeLabel;

                const atRiskNames = Array.from(atRiskComputers).sort();
                const atRiskListKey = `atrisk-${selectedMisconfig.id}`;
                const atRiskExpanded = expandedComputerLists.has(atRiskListKey);
                const securedNames = Array.from(assetData.secureComputers).sort();
                const securedListKey = `secured-${selectedMisconfig.id}`;
                const securedExpanded = expandedComputerLists.has(securedListKey);

                return (
                  <div className="mc-section">
                    <div className="mc-section-label">
                      Affected {scopeLabel === 'domain controllers' ? 'Domain Controllers' : 'Computers'}
                    </div>
                    <div className="bh-misconfig-summary">
                      {/* Precedence resolution notice */}
                      {assetData.conflictWinner && (
                        <div className="bh-misconfig-group conflict">
                          <div className="bh-misconfig-group-header">
                            <i className="fas fa-layer-group"></i>
                            GPO Precedence Resolved
                          </div>
                          <div className="bh-misconfig-note">
                            Multiple GPOs configure this setting on the same {scopeLabel}. Based on OU link order, <strong>{assetData.conflictWinner}</strong> takes precedence.
                          </div>
                        </div>
                      )}

                      {/* At Risk = insecure + unprotected */}
                      {atRiskCount > 0 && (
                        <div className="bh-misconfig-group unprotected">
                          <div className="bh-misconfig-group-header">
                            <i className="fas fa-shield-alt"></i>
                            At Risk — {atRiskCount}/{totalComp} {scopeLabel}
                            <button
                              className="bh-expand-computers"
                              onClick={() => toggleComputerList(atRiskListKey)}
                              title={atRiskExpanded ? 'Hide list' : 'Show list'}
                            >
                              <i className={`fas fa-chevron-${atRiskExpanded ? 'up' : 'down'}`}></i>
                            </button>
                          </div>
                          {assetData.isDefault ? (
                            <div className="bh-misconfig-note">No GPO configures this setting. All computers use the insecure Windows default.</div>
                          ) : (
                            <div className="bh-misconfig-note">
                              {assetData.unprotectedComputers.size > 0 && `${assetData.unprotectedComputers.size} unprotected (no GPO)`}
                              {assetData.unprotectedComputers.size > 0 && insecureGPOs.length > 0 && ' + '}
                              {insecureGPOs.length > 0 && `${assetData.insecureComputers.size} with insecure GPO`}
                            </div>
                          )}
                          {atRiskExpanded && (
                            <div className="bh-computer-expand-list">
                              <div className="bh-computer-expand-header">
                                <span>{atRiskNames.length} computers</span>
                                <button
                                  className="bh-copy-list-btn"
                                  onClick={() => copyComputerList(atRiskNames, atRiskListKey)}
                                  aria-label="Copy at-risk computer list"
                                >
                                  <i className={`fas ${copiedKey === atRiskListKey ? 'fa-check' : 'fa-copy'}`}></i>
                                  {copiedKey === atRiskListKey ? 'Copied' : 'Copy'}
                                </button>
                              </div>
                              <div className="bh-computer-expand-names">
                                {atRiskNames.map((name, ci) => (
                                  <div key={ci} className="bh-computer-expand-name">{name}</div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                      {/* Secured */}
                      {securedCount > 0 && (
                        <div className="bh-misconfig-group secure">
                          <div className="bh-misconfig-group-header">
                            <i className="fas fa-check-circle"></i>
                            Secured — {securedCount}/{totalComp} {scopeLabel}
                            <button
                              className="bh-expand-computers"
                              onClick={() => toggleComputerList(securedListKey)}
                              title={securedExpanded ? 'Hide list' : 'Show list'}
                            >
                              <i className={`fas fa-chevron-${securedExpanded ? 'up' : 'down'}`}></i>
                            </button>
                          </div>
                          {securedExpanded && (
                            <div className="bh-computer-expand-list">
                              <div className="bh-computer-expand-header">
                                <span>{securedNames.length} computers</span>
                                <button
                                  className="bh-copy-list-btn"
                                  onClick={() => copyComputerList(securedNames, securedListKey)}
                                  aria-label="Copy secured computer list"
                                >
                                  <i className={`fas ${copiedKey === securedListKey ? 'fa-check' : 'fa-copy'}`}></i>
                                  {copiedKey === securedListKey ? 'Copied' : 'Copy'}
                                </button>
                              </div>
                              <div className="bh-computer-expand-names">
                                {securedNames.map((name, ci) => (
                                  <div key={ci} className="bh-computer-expand-name">{name}</div>
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

              {/* BloodHound Query */}
              <div className="mc-section mc-section-actions">
                <button
                  className="mc-bh-query-btn"
                  onClick={() => setShowBloodHoundModal(true)}
                  title="Generate BloodHound query to find unprotected computers"
                >
                  <i className="fas fa-code"></i>
                  Generate BloodHound Query
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BloodHound Query Modal */}
      {showBloodHoundModal && selectedMisconfig && (() => {
        const { secureGPOs, insecureGPOs } = classifyGPOs(selectedMisconfig);

        // Build available query options
        const queryOptions: Array<{ id: string; label: string; description: string; icon: string; query: string }> = [];

        if (insecureGPOs.length > 0) {
          queryOptions.push({
            id: 'insecure',
            label: 'Computers with insecure GPO',
            description: `Find enabled computers affected by GPOs that set an insecure value for ${selectedMisconfig.name}.`,
            icon: 'fa-exclamation-triangle',
            query: generateBloodHoundQuery([], insecureGPOs),
          });
        }

        if (secureGPOs.length > 0) {
          queryOptions.push({
            id: 'unprotected',
            label: 'Computers NOT protected',
            description: `Find enabled computers NOT covered by GPOs that harden ${selectedMisconfig.name}. These use the insecure default.`,
            icon: 'fa-shield-alt',
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

