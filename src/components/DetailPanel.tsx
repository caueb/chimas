import React, { useState } from 'react';
import { FileResult } from '../types';
import { formatFileSize, formatDate } from '../utils/formatting';
import { CREDENTIALS_KEYWORDS } from '../utils/constants';
import { QuickActions } from './QuickActions';

interface DetailPanelProps {
  selectedResult: FileResult | null;
  onClose: () => void;
  onToggleFalsePositive: (result: FileResult) => void;
  falsePositives: Set<string>;
}

// Risk factor tooltips explaining what each criteria means
const RISK_FACTOR_TOOLTIPS: Record<string, string> = {
  'Severity': 'Based on Snaffler rating (Black=40, Red=30, Yellow=20, Green=10 points)',
  'Writable': 'File can be modified - potential for tampering or planting malicious content',
  'Credentials': 'Content contains credential-related keywords like password, secret, key, token',
  'Recent': 'File was modified within the last 7 days - indicates active use',
  'Executable': 'Script or executable file type (.ps1, .bat, .exe, etc.) - can run code',
  'Large File': 'File larger than 1MB - potential data store or database',
  'Sensitive Path': 'Located in high-value path (SYSVOL, GPO, startup folder, user profile, etc.)',
  'Config File': 'Configuration file type (.config, .ini, .yaml, etc.) - often contains secrets',
  'Sensitive Filename': 'Known sensitive filename (groups.xml, unattend.xml, web.config, etc.)',
  'Database File': 'Database file (.mdb, .sqlite, .db, etc.) - potential credential or data store',
  'Backup File': 'Backup or archive file (.bak, .old, etc.) - may contain original configs with secrets',
  'Cert/Key File': 'Certificate or private key file (.pfx, .pem, .key, etc.) - cryptographic material',
  'Full Access': 'File has read, write, and delete permissions - complete control available',
  'Rule Type': 'Snaffler rule indicates credential/secret content or high-value file type'
};

// Helper function to highlight credential keywords in text
const highlightCredentialKeywords = (text: string): React.ReactNode => {
  if (!text) return text;

  // Create regex pattern from keywords (case-insensitive)
  const pattern = new RegExp(
    `(${CREDENTIALS_KEYWORDS.map(k => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`,
    'gi'
  );

  const parts = text.split(pattern);

  return parts.map((part, index) => {
    const isKeyword = CREDENTIALS_KEYWORDS.some(
      keyword => part.toLowerCase() === keyword.toLowerCase()
    );
    if (isKeyword) {
      return (
        <mark key={index} className="credential-highlight">
          {part}
        </mark>
      );
    }
    return part;
  });
};

export const DetailPanel: React.FC<DetailPanelProps> = ({ selectedResult, onClose, onToggleFalsePositive, falsePositives }) => {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const [riskExpanded, setRiskExpanded] = useState(false);

  if (!selectedResult) {
    return null;
  }

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(selectedResult.fullPath);
      setCopyFeedback('Copied!');
      setTimeout(() => setCopyFeedback(null), 2000);
    } catch (error) {
      setCopyFeedback('Failed to copy');
      setTimeout(() => setCopyFeedback(null), 2000);
    }
  };

  return (
    <div className="detail-panel">
      <div className="detail-section">
        <div className="detail-label">
          FULL PATH
          <button
            className="copy-path-button"
            onClick={handleCopyPath}
            title="Copy path to clipboard"
          >
            <i className={`fas ${copyFeedback ? 'fa-check' : 'fa-copy'}`}></i>
            {copyFeedback && <span className="copy-feedback">{copyFeedback}</span>}
          </button>
        </div>
        <div className="detail-value-container">
          <div className="detail-value path">{selectedResult.fullPath}</div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-label">MATCH CONTEXT</div>
        <div className="detail-value-container">
          <pre className="detail-value context">
            {highlightCredentialKeywords(selectedResult.matchContext)}
          </pre>
        </div>
      </div>

      <div className="detail-section horizontal">
        <div className="detail-label">RATING:</div>
        <div className="detail-value">
          <span className={`rating ${selectedResult.rating.toLowerCase()}`}>
            {selectedResult.rating}
          </span>
        </div>
      </div>

      <div className="detail-section horizontal">
        <div className="detail-label">FILE NAME:</div>
        <div className="detail-value">{selectedResult.fileName}</div>
      </div>

      <div className="detail-section horizontal">
        <div className="detail-label">SIZE:</div>
        <div className="detail-value">{formatFileSize(selectedResult.size)}</div>
      </div>

      <div className="detail-section horizontal">
        <div className="detail-label">CREATION TIME:</div>
        <div className="detail-value">{formatDate(selectedResult.creationTime)}</div>
      </div>

      <div className="detail-section horizontal">
        <div className="detail-label">LAST MODIFIED:</div>
        <div className="detail-value">{formatDate(selectedResult.lastModified)}</div>
      </div>

      {selectedResult.userContext && (
        <div className="detail-section horizontal">
          <div className="detail-label">SCAN USER:</div>
          <div className="detail-value">{selectedResult.userContext}</div>
        </div>
      )}

      <div className="detail-section horizontal">
        <div className="detail-label">RULE NAME:</div>
        <div className="detail-value">{selectedResult.ruleName}</div>
      </div>

      {selectedResult.rwStatus && (
        <div className="detail-section">
          <div className="detail-label">FILE PERMISSIONS</div>
          <div className="detail-value-container">
            <div className="detail-value">
              <div className="permission-item">
                <span className={`permission-badge ${selectedResult.rwStatus.readable ? 'readable' : 'not-readable'}`}>
                  <i className={`fas ${selectedResult.rwStatus.readable ? 'fa-check' : 'fa-times'}`}></i> Read
                </span>
                <span className={`permission-badge ${selectedResult.rwStatus.writable ? 'writable' : 'not-writable'}`}>
                  <i className={`fas ${selectedResult.rwStatus.writable ? 'fa-check' : 'fa-times'}`}></i> Write
                </span>
                <span className={`permission-badge ${selectedResult.rwStatus.modifyable ? 'modifyable' : 'not-modifyable'}`}>
                  <i className={`fas ${selectedResult.rwStatus.modifyable ? 'fa-check' : 'fa-times'}`}></i> Modify
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      <QuickActions fullPath={selectedResult.fullPath} />

      {selectedResult.riskScore && (
        <div className="collapsible-section">
          <div
            className="collapsible-header"
            onClick={() => setRiskExpanded(!riskExpanded)}
          >
            <div className="collapsible-title">
              <i className="fas fa-shield-alt"></i>
              <span>Risk Score</span>
            </div>
            <div className="collapsible-summary">
              <span className={`risk-score-value risk-${selectedResult.riskScore.level}`}>
                {selectedResult.riskScore.total}
              </span>
              <span className={`risk-level-badge-compact risk-bg-${selectedResult.riskScore.level}`}>
                {selectedResult.riskScore.level.toUpperCase()}
              </span>
              <i className={`fas fa-chevron-${riskExpanded ? 'up' : 'down'} collapsible-toggle`}></i>
            </div>
          </div>
          {riskExpanded && (
            <div className="risk-factors-compact">
              {selectedResult.riskScore.factors.map((factor, index) => (
                <div key={index} className="risk-factor-row">
                  <span
                    className="risk-factor-name"
                    title={RISK_FACTOR_TOOLTIPS[factor.name] || factor.description}
                  >
                    {factor.name}
                    <i className="fas fa-info-circle risk-factor-info-icon"></i>
                  </span>
                  <span className="risk-factor-points">+{factor.points}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="detail-section horizontal">
        <div className="detail-label">FALSE POSITIVE:</div>
        <div className="detail-value">
          <label className="false-positive-checkbox">
            <input
              type="checkbox"
              checked={falsePositives.has(`${selectedResult.fullPath}-${selectedResult.fileName}`)}
              onChange={() => onToggleFalsePositive(selectedResult)}
            />
            Mark as false positive
            <span className="keyboard-shortcut">(F)</span>
          </label>
        </div>
      </div>
    </div>
  );
}; 