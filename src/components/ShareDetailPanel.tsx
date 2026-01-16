import React, { useState } from 'react';
import { ShareInfo } from './ShareResults';

interface ShareDetailPanelProps {
  selectedShare: ShareInfo | null;
  onClose: () => void;
}

export const ShareDetailPanel: React.FC<ShareDetailPanelProps> = ({ selectedShare, onClose }) => {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);

  if (!selectedShare) {
    return null;
  }

  const handleCopyPath = async () => {
    try {
      await navigator.clipboard.writeText(selectedShare.path);
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
          SHARE PATH
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
          <div className="detail-value path">{selectedShare.path}</div>
        </div>
      </div>

      <div className="detail-section horizontal">
        <div className="detail-label">SHARE NAME:</div>
        <div className="detail-value">{selectedShare.shareName}</div>
      </div>

      <div className="detail-section horizontal">
        <div className="detail-label">SHARE COMMENT:</div>
        <div className="detail-value">{selectedShare.shareComment || '-'}</div>
      </div>

      <div className="detail-section horizontal">
        <div className="detail-label">FILE COUNT:</div>
        <div className="detail-value">{selectedShare.fileCount || 0}</div>
      </div>

      <div className="detail-section horizontal">
        <div className="detail-label">SYSTEM ID:</div>
        <div className="detail-value">{selectedShare.systemId}</div>
      </div>

      <div className="detail-section">
        <div className="detail-label">PERMISSIONS</div>
        <div className="detail-value-container">
          <div className="detail-value">
            <div className="share-properties">
              {selectedShare.listable && (
                <span className="property-badge listable">Listable</span>
              )}
              {selectedShare.rootReadable && (
                <span className="property-badge readable">Readable</span>
              )}
              {selectedShare.rootWritable && (
                <span className="property-badge writable">Writable</span>
              )}
              {selectedShare.rootModifyable && (
                <span className="property-badge modifiable">Modifiable</span>
              )}
              {selectedShare.snaffle && (
                <span className="property-badge snaffle">Snaffle</span>
              )}
              {selectedShare.scanShare && (
                <span className="property-badge scan">Scan</span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
