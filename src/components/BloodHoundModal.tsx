import React, { useState, useRef, useCallback } from 'react';
import JSZip from 'jszip';
import type { BloodHoundData, BHFileType } from '../types/BloodHound';
import {
  detectBloodHoundFileType,
  parseBloodHoundFile,
  createEmptyBloodHoundData,
} from '../utils/bloodhoundParser';

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

interface JsonCandidate {
  name: string;
  text: string;
}

function isZipFile(file: File): boolean {
  const name = file.name.toLowerCase();
  if (name.endsWith('.zip')) return true;
  return (
    file.type === 'application/zip' ||
    file.type === 'application/x-zip-compressed' ||
    file.type === 'application/x-zip'
  );
}

function isJsonFileName(name: string): boolean {
  return name.toLowerCase().endsWith('.json');
}

function baseName(path: string): string {
  const parts = path.replace(/\\/g, '/').split('/');
  return parts[parts.length - 1] || path;
}

/** Expand selected files into JSON text; ZIP archives are unpacked in-browser. */
async function expandToJsonCandidates(files: File[]): Promise<{
  candidates: JsonCandidate[];
  info: string[];
  errors: string[];
}> {
  const candidates: JsonCandidate[] = [];
  const info: string[] = [];
  const errors: string[] = [];

  for (const file of files) {
    if (isZipFile(file)) {
      try {
        const zip = await JSZip.loadAsync(file);
        const entries = Object.values(zip.files).filter(
          e => !e.dir && isJsonFileName(e.name) && !e.name.split('/').some(p => p.startsWith('__MACOSX') || p.startsWith('.'))
        );

        if (entries.length === 0) {
          errors.push(`${file.name}: no JSON files found inside the archive`);
          continue;
        }

        let extracted = 0;
        for (const entry of entries) {
          try {
            const text = await entry.async('string');
            candidates.push({ name: `${file.name}/${baseName(entry.name)}`, text });
            extracted++;
          } catch {
            errors.push(`${file.name}: failed to read ${baseName(entry.name)}`);
          }
        }
        info.push(`${file.name}: extracted ${extracted} JSON file${extracted === 1 ? '' : 's'}`);
      } catch {
        errors.push(`${file.name}: not a valid ZIP archive`);
      }
      continue;
    }

    if (isJsonFileName(file.name)) {
      try {
        const text = await file.text();
        candidates.push({ name: file.name, text });
      } catch {
        errors.push(`${file.name}: failed to read file`);
      }
      continue;
    }

    info.push(`Skipped ${file.name} (not a .zip or .json)`);
  }

  return { candidates, info, errors };
}

export function BloodHoundModal({ bloodHoundData, onDataLoaded, onClose }: BloodHoundModalProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [infoMessages, setInfoMessages] = useState<string[]>([]);
  const [loadingLabel, setLoadingLabel] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadedTypes = bloodHoundData?.loadedTypes ?? new Set<BHFileType>();

  const processFiles = useCallback(async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    if (fileArray.length === 0) return;

    setLoadingLabel('Reading files…');
    setErrors([]);
    setInfoMessages([]);

    try {
      const { candidates, info, errors: expandErrors } = await expandToJsonCandidates(fileArray);
      const newErrors = [...expandErrors];
      const newInfo = [...info];

      if (candidates.length === 0) {
        if (newErrors.length === 0) {
          newErrors.push('No BloodHound JSON files found. Drop a BloodHound export ZIP or the required JSON files.');
        }
        setErrors(newErrors);
        setInfoMessages(newInfo);
        setLoadingLabel(null);
        return;
      }

      setLoadingLabel(`Parsing ${candidates.length} JSON file${candidates.length === 1 ? '' : 's'}…`);

      let current = bloodHoundData ?? createEmptyBloodHoundData();
      let loaded = 0;
      let skippedUnrecognized = 0;
      const loadedTypeNames: string[] = [];

      for (const { name, text } of candidates) {
        try {
          const json = JSON.parse(text);
          const fileType = detectBloodHoundFileType(json);
          if (!fileType) {
            // Skip unrecognized BH types (e.g. certificates)
            skippedUnrecognized++;
            continue;
          }
          current = parseBloodHoundFile(json, current, name);
          loaded++;
          loadedTypeNames.push(fileType);
        } catch {
          newErrors.push(`${baseName(name)}: failed to parse JSON`);
        }
      }

      if (skippedUnrecognized > 0) {
        newInfo.push(
          `Ignored ${skippedUnrecognized} JSON file${skippedUnrecognized === 1 ? '' : 's'} not needed for GPO analysis (e.g. certificates)`
        );
      }

      if (loaded > 0) {
        onDataLoaded(current);
        const uniqueTypes = [...new Set(loadedTypeNames)];
        newInfo.push(`Loaded ${uniqueTypes.length} type${uniqueTypes.length === 1 ? '' : 's'}: ${uniqueTypes.join(', ')}`);
      } else if (newErrors.length === 0) {
        newErrors.push(
          'No recognized BloodHound types found. Need gpos, ous, domains, computers, and users (groups/containers optional).'
        );
      }

      setErrors(newErrors);
      setInfoMessages(newInfo);
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to process files']);
    } finally {
      setLoadingLabel(null);
    }
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
          <h2>
            <i className="fas fa-project-diagram" style={{ marginRight: 8 }}></i>
            Load BloodHound Data
          </h2>
          <button className="modal-close-button" onClick={onClose} aria-label="Close dialog">
            <i className="fas fa-times"></i>
          </button>
        </div>
        <div className="modal-body">
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
              accept=".zip,.json,application/zip,application/json"
              multiple
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />
            {loadingLabel ? (
              <div className="bh-dropzone-text">
                <i className="fas fa-spinner fa-spin"></i>
                <span>{loadingLabel}</span>
              </div>
            ) : (
              <div className="bh-dropzone-text">
                <i className="fas fa-file-archive"></i>
                <span>Drop a BloodHound export ZIP here or click to browse</span>
                <span className="bh-dropzone-hint">
                  Preferred: single <strong>.zip</strong> from SharpHound / BloodHound collectors.
                  Individual JSON files still work.
                </span>
              </div>
            )}
          </div>

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

          {infoMessages.length > 0 && (
            <div className="bh-info-list">
              {infoMessages.map((msg, i) => (
                <div key={i} className="bh-info-item">
                  <i className="fas fa-info-circle"></i> {msg}
                </div>
              ))}
            </div>
          )}

          {errors.length > 0 && (
            <div className="bh-errors">
              {errors.map((err, i) => (
                <div key={i} className="bh-error-item">
                  <i className="fas fa-exclamation-circle"></i> {err}
                </div>
              ))}
            </div>
          )}

          {loadedTypes.size > 0 && (
            <div className={`bh-status ${requiredLoaded ? 'ready' : 'partial'}`}>
              <i className={`fas ${requiredLoaded ? 'fa-check-circle' : 'fa-info-circle'}`}></i>
              {requiredLoaded
                ? `All required types loaded (${loadedTypes.size}/7). Asset resolution is active.`
                : `${loadedTypes.size}/7 types loaded. Still need: ${ALL_TYPES.filter(t => t.required && !loadedTypes.has(t.type)).map(t => t.label).join(', ')}.`}
            </div>
          )}
        </div>

        <div className="bh-modal-footer">
          <button className="action-button" onClick={onClose} type="button">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
