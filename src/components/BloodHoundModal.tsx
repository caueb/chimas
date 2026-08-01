import React, { useState, useRef, useCallback } from 'react';
import type { BloodHoundData, BHFileType } from '../types/BloodHound';
import { detectBloodHoundFileType, parseBloodHoundFile, createEmptyBloodHoundData } from '../utils/bloodhoundParser';

interface BloodHoundModalProps {
  bloodHoundData: BloodHoundData | null;
  onDataLoaded: (data: BloodHoundData) => void;
  onClose: () => void;
}

const ALL_TYPES: { type: BHFileType; label: string; required: boolean }[] = [
  { type: 'gpos', label: 'GPOs', required: true },
  { type: 'ous', label: 'OUs', required: true },
  { type: 'domains', label: 'Domains', required: true },
  { type: 'computers', label: 'Computers', required: true },
  { type: 'users', label: 'Users', required: true },
  { type: 'groups', label: 'Groups', required: false },
  { type: 'containers', label: 'Containers', required: false },
];

export function BloodHoundModal({ bloodHoundData, onDataLoaded, onClose }: BloodHoundModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [loadingCount, setLoadingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadedTypes = bloodHoundData?.loadedTypes ?? new Set<BHFileType>();

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setLoadingCount(fileArray.length);
    setErrors([]);
    const newErrors: string[] = [];
    let current = bloodHoundData ?? createEmptyBloodHoundData();
    let loaded = 0;

    for (const file of fileArray) {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const fileType = detectBloodHoundFileType(json);
        if (!fileType) {
          newErrors.push(`${file.name}: not a recognized BloodHound file`);
          continue;
        }
        current = parseBloodHoundFile(json, current, file.name);
        loaded++;
      } catch {
        newErrors.push(`${file.name}: failed to parse`);
      }
    }

    if (loaded > 0) {
      onDataLoaded(current);
    }
    setErrors(newErrors);
    setLoadingCount(0);
  }, [bloodHoundData, onDataLoaded]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  }, [processFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    e.target.value = '';
  }, [processFiles]);

  const requiredLoaded = ALL_TYPES
    .filter(t => t.required)
    .every(t => loadedTypes.has(t.type));

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content bh-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2><i className="fas fa-project-diagram" style={{ marginRight: 8 }}></i>Load BloodHound Data</h2>
          <button className="modal-close-button" onClick={onClose} aria-label="Close dialog">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
          {/* Drop zone */}
          <div
            className={`bh-dropzone ${isDragging ? 'dragging' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            {loadingCount > 0 ? (
              <div className="bh-dropzone-text">
                <i className="fas fa-spinner fa-spin"></i>
                <span>Processing {loadingCount} file{loadingCount > 1 ? 's' : ''}...</span>
              </div>
            ) : (
              <div className="bh-dropzone-text">
                <i className="fas fa-file-upload"></i>
                <span>Drop BloodHound JSON files here or click to browse</span>
                <span className="bh-dropzone-hint">You can select multiple files at once</span>
              </div>
            )}
          </div>

          {/* File type checklist */}
          <div className="bh-type-checklist">
            <div className="bh-type-checklist-header">File Types</div>
            <div className="bh-type-grid">
              {ALL_TYPES.map(({ type, label, required }) => {
                const isLoaded = loadedTypes.has(type);
                return (
                  <div key={type} className={`bh-type-item ${isLoaded ? 'loaded' : ''}`}>
                    <i className={`fas ${isLoaded ? 'fa-check-circle' : 'fa-circle'}`}></i>
                    <span className="bh-type-label">{label}</span>
                    {required ? (
                      <span className="bh-type-tag required">required</span>
                    ) : (
                      <span className="bh-type-tag optional">optional</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div className="bh-errors">
              {errors.map((err, i) => (
                <div key={i} className="bh-error-item">
                  <i className="fas fa-exclamation-circle"></i> {err}
                </div>
              ))}
            </div>
          )}

          {/* Status message */}
          {loadedTypes.size > 0 && (
            <div className={`bh-status ${requiredLoaded ? 'ready' : 'partial'}`}>
              <i className={`fas ${requiredLoaded ? 'fa-check-circle' : 'fa-info-circle'}`}></i>
              {requiredLoaded
                ? `All required files loaded (${loadedTypes.size}/7 types). Asset resolution is active.`
                : `${loadedTypes.size}/7 types loaded. Load all required files for full asset resolution.`
              }
            </div>
          )}
        </div>

        <div className="bh-modal-footer">
          <button className="action-button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
