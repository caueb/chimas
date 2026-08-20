import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FileResult, ShareInfo } from '../types';
import { formatFileSize } from '../utils/formatting';
import { copyToClipboard } from '../utils/bloodhoundQuery';
import { showToast } from './shared';
import {
  ATTACK_CATEGORY_ICONS,
  ATTACK_CATEGORY_LABELS,
  AttackCategory,
  AttackOpportunity,
  AttackTarget,
  buildPlaybookCommands,
  detectAttackOpportunities,
  hostOfFile,
  uniqueHosts,
} from '../utils/attackPlaybooks';
import './AttackOpportunities.css';

interface AttackOpportunitiesProps {
  results: FileResult[];
  shareResults: ShareInfo[];
  onSelectFile: (file: FileResult) => void;
  onFilterByPlaybookFiles: (paths: string[], label: string) => void;
  onNavigateToResults: () => void;
  onNavigateToShares: () => void;
}

function targetKey(target: AttackTarget, index: number): string {
  if (target.kind === 'file') {
    return `file:${target.file.fullPath}:${target.file.fileName}:${index}`;
  }
  return `share:${target.share.systemId}:${target.share.shareName}:${index}`;
}

function targetLabel(target: AttackTarget): string {
  return target.kind === 'file'
    ? target.file.fileName
    : `\\\\${target.share.systemId}\\${target.share.shareName}`;
}

function targetPath(target: AttackTarget): string {
  return target.kind === 'file'
    ? target.file.fullPath
    : target.share.path || `\\\\${target.share.systemId}\\${target.share.shareName}`;
}

export const AttackOpportunities: React.FC<AttackOpportunitiesProps> = ({
  results,
  shareResults,
  onSelectFile,
  onFilterByPlaybookFiles,
  onNavigateToResults,
  onNavigateToShares,
}) => {
  const opportunities = useMemo(
    () => detectAttackOpportunities(results, shareResults),
    [results, shareResults]
  );

  const [categoryFilter, setCategoryFilter] = useState<AttackCategory | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedTargetKey, setSelectedTargetKey] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const detailMainRef = useRef<HTMLDivElement>(null);
  const detailFilesRef = useRef<HTMLElement>(null);

  const visibleOpportunities = useMemo(() => {
    if (categoryFilter === 'all') return opportunities;
    return opportunities.filter((item) => item.def.category === categoryFilter);
  }, [opportunities, categoryFilter]);

  const selected =
    visibleOpportunities.find((item) => item.def.id === selectedId) ||
    visibleOpportunities[0] ||
    null;

  useEffect(() => {
    if (!selected) {
      setSelectedTargetKey(null);
      return;
    }
    const keys = selected.targets.map(targetKey);
    if (!selectedTargetKey || !keys.includes(selectedTargetKey)) {
      setSelectedTargetKey(keys[0] ?? null);
    }
  }, [selected, selectedTargetKey]);

  useLayoutEffect(() => {
    const main = detailMainRef.current;
    const files = detailFilesRef.current;
    if (!main || !files) return;

    const stackedQuery = window.matchMedia('(max-width: 980px)');
    const syncHeight = () => {
      if (stackedQuery.matches) {
        files.style.maxHeight = '320px';
        return;
      }
      files.style.maxHeight = `${Math.round(main.getBoundingClientRect().height)}px`;
    };

    syncHeight();
    const observer = new ResizeObserver(syncHeight);
    observer.observe(main);
    stackedQuery.addEventListener('change', syncHeight);
    return () => {
      observer.disconnect();
      stackedQuery.removeEventListener('change', syncHeight);
      files.style.maxHeight = '';
    };
  }, [selected?.def.id]);

  const categories = useMemo(() => {
    const present = new Set<AttackCategory>();
    for (const item of opportunities) present.add(item.def.category);
    return Array.from(present);
  }, [opportunities]);

  if (opportunities.length === 0) {
    return null;
  }

  const selectedTarget =
    selected?.targets.find((target, index) => targetKey(target, index) === selectedTargetKey) ||
    selected?.targets[0];

  const commands = selected ? buildPlaybookCommands(selected, selectedTarget) : [];
  const hosts = selected ? uniqueHosts(selected) : [];
  const visibleTargets = selected ? selected.targets : [];

  const handleCopy = async (text: string, key: string) => {
    const ok = await copyToClipboard(text);
    if (ok) {
      setCopiedKey(key);
      showToast('Copied to clipboard', 'success');
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1600);
    } else {
      showToast('Copy failed', 'error');
    }
  };

  const handleViewMatching = (item: AttackOpportunity) => {
    if (item.def.source === 'shares') {
      onNavigateToShares();
      return;
    }
    const paths = item.targets
      .filter((target): target is { kind: 'file'; file: FileResult } => target.kind === 'file')
      .map((target) => target.file.fullPath);
    onNavigateToResults();
    if (paths.length > 0) {
      onFilterByPlaybookFiles(paths, item.def.title);
    }
  };

  const handleOpenTarget = (target: AttackTarget) => {
    if (target.kind === 'file') {
      onNavigateToResults();
      onSelectFile(target.file);
    } else {
      onNavigateToShares();
    }
  };

  const totalFiles = opportunities.reduce(
    (sum, item) => sum + item.targets.filter((target) => target.kind === 'file').length,
    0
  );

  return (
    <section className="attack-opportunities" aria-label="Attack opportunities">
      <div className="attack-opportunities-header">
        <div className="attack-opportunities-title-row">
          <h2>Attack Opportunities</h2>
          <p className="attack-opportunities-subtitle">
            {opportunities.length} playbook{opportunities.length === 1 ? '' : 's'} from this scan
            {totalFiles > 0 ? ` · ${totalFiles} matching file${totalFiles === 1 ? '' : 's'}` : ''}
          </p>
        </div>
        <div className="attack-category-filters" role="tablist" aria-label="Filter playbooks">
          <button
            type="button"
            role="tab"
            aria-selected={categoryFilter === 'all'}
            className={`nav-tab ${categoryFilter === 'all' ? 'active' : ''}`}
            onClick={() => setCategoryFilter('all')}
          >
            <i className={`fas ${ATTACK_CATEGORY_ICONS.all}`}></i>
            <span>All</span>
            <span className="nav-badge">{opportunities.length}</span>
          </button>
          {categories.map((category) => {
            const count = opportunities.filter((item) => item.def.category === category).length;
            return (
              <button
                key={category}
                type="button"
                role="tab"
                aria-selected={categoryFilter === category}
                className={`nav-tab ${categoryFilter === category ? 'active' : ''}`}
                onClick={() => setCategoryFilter(category)}
              >
                <i className={`fas ${ATTACK_CATEGORY_ICONS[category]}`}></i>
                <span>{ATTACK_CATEGORY_LABELS[category]}</span>
                <span className="nav-badge">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="attack-card-grid">
        {visibleOpportunities.map((item) => {
          const isSelected = selected?.def.id === item.def.id;
          const itemHosts = uniqueHosts(item);
          return (
            <button
              key={item.def.id}
              type="button"
              className={`attack-card attack-card-${item.def.severity} ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedId(item.def.id)}
              aria-pressed={isSelected}
            >
              <div className="attack-card-top">
                <span className="attack-card-icon" aria-hidden="true">
                  <i className={`fas ${item.def.icon}`}></i>
                </span>
                <span className={`severity-badge severity-${item.def.severity}`}>
                  {item.def.severity}
                </span>
              </div>
              <div className="attack-card-title">{item.def.title}</div>
              <div className="attack-card-summary">{item.def.summary}</div>
              <div className="attack-card-meta">
                <span>
                  {item.targets.length} {item.def.source === 'shares' ? 'share' : 'file'}
                  {item.targets.length === 1 ? '' : 's'}
                </span>
                {itemHosts.length > 0 && (
                  <span>
                    {itemHosts.length} host{itemHosts.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="attack-detail">
          <div className="attack-detail-main" ref={detailMainRef}>
            <div className="attack-detail-heading">
              <div>
                <div className="attack-detail-kicker">
                  <span className={`severity-badge severity-${selected.def.severity}`}>
                    {selected.def.severity}
                  </span>
                  <span className="attack-detail-category">
                    {ATTACK_CATEGORY_LABELS[selected.def.category]}
                  </span>
                </div>
                <h3>{selected.def.title}</h3>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => handleViewMatching(selected)}
              >
                <i className="fas fa-external-link-alt"></i>
                {selected.def.source === 'shares' ? 'Open shares' : 'View matching files'}
              </button>
            </div>

            <p className="attack-detail-why">{selected.def.why}</p>

            <div className="attack-detail-block">
              <h4>Suggested next steps</h4>
              <ol className="attack-next-steps">
                {selected.def.nextSteps.map((step) => (
                  <li key={step}>{step}</li>
                ))}
              </ol>
            </div>

            <div className="attack-detail-block">
              <h4>Tools</h4>
              <div className="attack-tools">
                {selected.def.tools.map((tool) => (
                  <span key={tool} className="attack-tool">
                    {tool}
                  </span>
                ))}
              </div>
            </div>

            {commands.length > 0 && (
              <div className="attack-detail-block">
                <h4>
                  Commands
                  {selectedTarget && (
                    <span className="attack-command-target">
                      for {targetLabel(selectedTarget)}
                    </span>
                  )}
                </h4>
                <div className="attack-commands">
                  {commands.map((command) => (
                    <div key={command.label} className="attack-command">
                      <div className="attack-command-header">
                        <div>
                          <div className="attack-command-label">{command.label}</div>
                          <div className="attack-command-desc">{command.description}</div>
                        </div>
                        <button
                          type="button"
                          className="btn btn-sm"
                          onClick={() => handleCopy(command.command, `cmd:${command.label}`)}
                        >
                          <i
                            className={`fas ${copiedKey === `cmd:${command.label}` ? 'fa-check' : 'fa-copy'}`}
                          ></i>
                          {copiedKey === `cmd:${command.label}` ? 'Copied' : 'Copy'}
                        </button>
                      </div>
                      <pre className="attack-command-code">{command.command}</pre>
                    </div>
                  ))}
                </div>
                <p className="attack-command-note">
                  Commands are templates. Swap in your engagement credentials and confirm the
                  target before running anything.
                </p>
              </div>
            )}
          </div>

          <aside className="attack-detail-files" ref={detailFilesRef}>
            <div className="attack-files-header">
              <h4>{selected.def.source === 'shares' ? 'Writable shares' : 'Matching files'}</h4>
              <span className="attack-files-count">
                {selected.targets.length}
                {hosts.length > 0 ? ` · ${hosts.length} host${hosts.length === 1 ? '' : 's'}` : ''}
              </span>
            </div>
            <ul className="attack-file-list">
              {visibleTargets.map((target, index) => {
                const key = targetKey(target, index);
                const isActive = key === selectedTargetKey;
                return (
                  <li key={key}>
                    <div
                      className={`attack-file-row ${isActive ? 'active' : ''}`}
                      onClick={() => setSelectedTargetKey(key)}
                      onDoubleClick={() => handleOpenTarget(target)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedTargetKey(key);
                        }
                      }}
                    >
                      <div className="attack-file-main">
                        <div className="attack-file-name">
                          {target.kind === 'file' && (
                            <span className={`rating ${target.file.rating.toLowerCase()}`}>
                              {target.file.rating}
                            </span>
                          )}
                          {target.kind === 'share' && (
                            <span className="rating red">Write</span>
                          )}
                          <span title={targetLabel(target)}>{targetLabel(target)}</span>
                        </div>
                        <div className="attack-file-path" title={targetPath(target)}>
                          {target.kind === 'file'
                            ? `${hostOfFile(target.file) || 'share'} · ${formatFileSize(target.file.size)}`
                            : `${target.share.permissions || 'writable'} · ${target.share.fileCount || 0} files`}
                        </div>
                      </div>
                      <div className="attack-file-actions">
                        <button
                          type="button"
                          className="attack-icon-btn"
                          title="Copy path"
                          onClick={(event) => {
                            event.stopPropagation();
                            handleCopy(targetPath(target), `path:${key}`);
                          }}
                        >
                          <i
                            className={`fas ${copiedKey === `path:${key}` ? 'fa-check' : 'fa-copy'}`}
                          ></i>
                        </button>
                        <button
                          type="button"
                          className="attack-icon-btn"
                          title={target.kind === 'file' ? 'Open file' : 'Open shares'}
                          onClick={(event) => {
                            event.stopPropagation();
                            handleOpenTarget(target);
                          }}
                        >
                          <i className="fas fa-arrow-right"></i>
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </aside>
        </div>
      )}
    </section>
  );
};
