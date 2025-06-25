import React from 'react';

interface FileUploadProps {
  onFileUpload: (data: any, fileType: 'json' | 'text' | 'log', fileName: string, fileSize?: string) => void;
  onReset: () => void;
  loadedFileName: string;
  onThemeToggle: () => void;
  isDarkTheme: boolean;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, onReset, loadedFileName, onThemeToggle, isDarkTheme }) => {
  return (
    <div className="file-upload-container">
      <div className="theme-toggle-top">
        <button className="action-button theme-toggle-button" onClick={onThemeToggle}>
          <i className={`fas fa-${isDarkTheme ? 'sun' : 'moon'} button-icon`}></i>
          {isDarkTheme ? 'Light' : 'Dark'}
        </button>
      </div>
      
      <div className="landing-description">
        <div className="description-content">
          <div className="chimas-ascii-art">
            <div className="chimas-emoji">🧉</div>
            <div className="chimas-title">Chimas</div>
          </div>
          <p className="chimas-tagline">Sipping secrets from SMB shares, one credential at a time</p>
          <p>A powerful tool for analyzing and exploring Snaffler output data. Upload your Snaffler JSON or text files to discover potential security findings, analyze file permissions, and explore network shares.</p>
          
          <div className="landing-actions">
            <button className="action-button browse-button" onClick={() => document.getElementById('file-input')?.click()}>
              <i className="fas fa-upload button-icon"></i>
              Browse Files
            </button>
          </div>
          
          <p className="upload-hint">Use the "Browse Files" button above to upload your Snaffler output file and happy hunting.</p>
        </div>
      </div>
    </div>
  );
}; 