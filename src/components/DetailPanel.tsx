import React from 'react';
import { FileResult } from '../types';
import { format } from 'date-fns';

interface DetailPanelProps {
  selectedResult: FileResult | null;
  onClose: () => void;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({ selectedResult, onClose }) => {
  if (!selectedResult) {
    return null;
  }

  const formatFileSize = (size: string) => {
    const sizeNum = parseInt(size);
    if (isNaN(sizeNum)) return size;
    
    if (sizeNum < 1024) return `${sizeNum} B`;
    if (sizeNum < 1024 * 1024) return `${(sizeNum / 1024).toFixed(1)} KB`;
    if (sizeNum < 1024 * 1024 * 1024) return `${(sizeNum / (1024 * 1024)).toFixed(1)} MB`;
    return `${(sizeNum / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  const formatDate = (dateString: string) => {
    try {
      return format(new Date(dateString), 'dd/MM/yyyy HH:mm:ss');
    } catch {
      return dateString;
    }
  };

  return (
    <div className="detail-panel">
      <div className="detail-section">
        <div className="detail-label">FULL PATH</div>
        <div className="detail-value-container">
          <div className="detail-value path">{selectedResult.fullPath}</div>
        </div>
      </div>

      <div className="detail-section">
        <div className="detail-label">MATCH CONTEXT</div>
        <div className="detail-value-container">
          <pre className="detail-value context">{selectedResult.matchContext}</pre>
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
                  {selectedResult.rwStatus.readable ? '✓' : '✗'} Readable
                </span>
                <span className={`permission-badge ${selectedResult.rwStatus.writable ? 'writable' : 'not-writable'}`}>
                  {selectedResult.rwStatus.writable ? '✓' : '✗'} Writable
                </span>
                {selectedResult.rwStatus.executable !== undefined && (
                  <span className={`permission-badge ${selectedResult.rwStatus.executable ? 'executable' : 'not-executable'}`}>
                    {selectedResult.rwStatus.executable ? '✓' : '✗'} Executable
                  </span>
                )}
                <span className={`permission-badge ${selectedResult.rwStatus.deleteable ? 'deleteable' : 'not-deleteable'}`}>
                  {selectedResult.rwStatus.deleteable ? '✓' : '✗'} Deleteable
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}; 