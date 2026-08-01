import React, { useState } from 'react';

interface FileUploadProps {
  onThemeToggle: () => void;
  onProcessFile?: (file: File) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({
  onThemeToggle,
  onProcessFile,
}) => {
  const [isDragging, setIsDragging] = useState(false);

  const preventDefaults = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDragEnter = (e: React.DragEvent) => {
    preventDefaults(e);
    setIsDragging(true);
  };

  const handleDragOver = (e: React.DragEvent) => {
    preventDefaults(e);
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    preventDefaults(e);
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    preventDefaults(e);
    setIsDragging(false);
    const dt = e.dataTransfer;
    const files = dt?.files;
    if (files && files.length > 0) {
      const file = files[0];
      if (onProcessFile) onProcessFile(file);
    }
  };

  return (
    <div className="file-upload-container">
      <div className="theme-toggle-top">
        <div
          className="theme-toggle-switch"
          onClick={onThemeToggle}
          role="button"
          tabIndex={0}
          aria-label="Toggle theme"
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') onThemeToggle();
          }}
        >
          <i className="fas fa-moon sun-icon"></i>
          <i className="fas fa-sun moon-icon"></i>
        </div>
      </div>

      <div
        className={`landing-description card ${isDragging ? 'drag-active' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="description-content">
          <div className="path-label">/HOME</div>
          <h1 className="hero-title chimas-title">chimas</h1>

          <div className="tags">
            <span className="tag">Snaffler</span>
            <span className="tag">File Shares</span>
            <span className="tag">Credentials</span>
          </div>
          <p className="description-body">
            Load Snaffler output to search for sensitive data in file shares. Use the filters to help you with the creds hunt.
          </p>
          <div className="tags">
            <span className="tag">Group3r</span>
            <span className="tag">GPO</span>
            <span className="tag">BloodHound</span>
          </div>
          <p className="description-body">
            Load Group3r output to analyse GPOs and its settings. Import Bloodhound data to create a mapping of GPO to affected object.
          </p>
          <div className="btn-row landing-actions">
            <button
              className="btn btn-primary"
              onClick={() => document.getElementById('file-input')?.click()}
              type="button"
            >
              <i className="fas fa-upload button-icon"></i>
              Load File
            </button>
          </div>
          <p className="upload-hint">
            Drop a Snaffler or Group3r output file here, or use Load File.
          </p>
        </div>
      </div>
    </div>
  );
};
