import React from 'react';
import { FileResult } from '../types';
import { format } from 'date-fns';

interface DetailPanelProps {
  selectedResult: FileResult | null;
  onClose: () => void;
  onToggleFalsePositive: (result: FileResult) => void;
  falsePositives: Set<string>;
}

export const DetailPanel: React.FC<DetailPanelProps> = ({ selectedResult, onClose, onToggleFalsePositive, falsePositives }) => {
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

  // Function to highlight regex matches in the match context
  const highlightMatches = (context: string, patterns: string[]) => {
    if (!patterns || patterns.length === 0) {
      return context;
    }

    let highlightedText = context;
    
    patterns.forEach((pattern, index) => {
      try {
        // Create a regex from the pattern, handling special characters
        const regex = new RegExp(pattern, 'gi');
        const matches = highlightedText.match(regex);
        
        if (matches) {
          // Replace each match with a highlighted version
          matches.forEach(match => {
            const highlightedMatch = `<span class="regex-highlight" data-pattern="${pattern}">${match}</span>`;
            highlightedText = highlightedText.replace(match, highlightedMatch);
          });
        }
      } catch (error) {
        // If regex is invalid, just highlight the pattern as literal text
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const literalRegex = new RegExp(escapedPattern, 'gi');
        const matches = highlightedText.match(literalRegex);
        
        if (matches) {
          matches.forEach(match => {
            const highlightedMatch = `<span class="regex-highlight" data-pattern="${pattern}">${match}</span>`;
            highlightedText = highlightedText.replace(match, highlightedMatch);
          });
        }
      }
    });
    
    return highlightedText;
  };

  const highlightedContext = highlightMatches(selectedResult.matchContext, selectedResult.matchedStrings);

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
          <pre 
            className="detail-value context" 
            dangerouslySetInnerHTML={{ __html: highlightedContext }}
          />
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
                {selectedResult.rwStatus.executable !== undefined && (
                  <span className={`permission-badge ${selectedResult.rwStatus.executable ? 'executable' : 'not-executable'}`}>
                    <i className={`fas ${selectedResult.rwStatus.executable ? 'fa-check' : 'fa-times'}`}></i> Execute
                  </span>
                )}
                <span className={`permission-badge ${selectedResult.rwStatus.deleteable ? 'deleteable' : 'not-deleteable'}`}>
                  <i className={`fas ${selectedResult.rwStatus.deleteable ? 'fa-check' : 'fa-times'}`}></i> Delete
                </span>
              </div>
            </div>
          </div>
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