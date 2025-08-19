import React, { useState } from 'react';

interface FileUploadProps {
  onFileUpload: (data: any, fileType: 'json' | 'text' | 'log', fileName: string, fileSize?: string) => void;
  onReset: () => void;
  loadedFileName: string;
  onThemeToggle: () => void;
  isDarkTheme: boolean;
  onProcessFile?: (file: File) => void;
}

export const FileUpload: React.FC<FileUploadProps> = ({ onFileUpload, onReset, loadedFileName, onThemeToggle, isDarkTheme, onProcessFile }) => {
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
        <div className="theme-toggle-switch" onClick={onThemeToggle}>
          <i className="fas fa-moon sun-icon"></i>
          <i className="fas fa-sun moon-icon"></i>
        </div>
      </div>
      
      <div 
        className={`landing-description ${isDragging ? 'drag-active' : ''}`}
        onDragEnter={handleDragEnter}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div className="description-content">
          <div className="chimas-title">Chimas</div>
          <p className="chimas-tagline">Sipping secrets from SMB shares and GPOs, one credential at a time.</p>
          <p>A powerful tool for analyzing and exploring Snaffler / Group3r output data. Upload your Snaffler / Group3r output to discover potential security findings, analyze file permissions, and explore network shares.</p>
          
          <div className="landing-actions">
            <button className="action-button browse-button" onClick={() => document.getElementById('file-input')?.click()}>
              <i className="fas fa-upload button-icon"></i>
              Browse Files
            </button>
          </div>
          
          <p className="upload-hint">Use the "Browse Files" or drag and drop your Snaffler / Group3r output file here.</p>
        </div>
      </div>
    </div>
  );
}; 