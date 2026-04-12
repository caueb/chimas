import React, { useState } from 'react';
import { generateAllCommands, parseUNCPath } from '../utils/commandGenerator';

interface QuickActionsProps {
  fullPath: string;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ fullPath }) => {
  const [expanded, setExpanded] = useState(false);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const parsed = parseUNCPath(fullPath);
  if (!parsed) return null;

  const commands = generateAllCommands(fullPath);

  const handleCopy = async (command: string, name: string) => {
    try {
      await navigator.clipboard.writeText(command);
      setCopiedCmd(name);
      setTimeout(() => setCopiedCmd(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  return (
    <div className="collapsible-section">
      <div
        className="collapsible-header"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="collapsible-title">
          <i className="fas fa-terminal"></i>
          <span>Quick Actions</span>
        </div>
        <i className={`fas fa-chevron-${expanded ? 'up' : 'down'} collapsible-toggle`}></i>
      </div>

      {expanded && (
        <div className="quick-actions-content">
          <div className="quick-actions-info">
            <p>Replace DOMAIN/USER/PASSWORD with actual credentials.</p>
          </div>
          <div className="quick-actions-list">
            {commands.map((cmd) => (
              <div key={cmd.name} className="quick-action-item">
                <div className="quick-action-header">
                  <span className="quick-action-name">
                    <i className={`fas ${cmd.icon}`}></i>
                    {cmd.name}
                  </span>
                  <button
                    className={`quick-action-copy ${copiedCmd === cmd.name ? 'copied' : ''}`}
                    onClick={() => handleCopy(cmd.command, cmd.name)}
                    title={cmd.description}
                  >
                    <i className={`fas ${copiedCmd === cmd.name ? 'fa-check' : 'fa-copy'}`}></i>
                    {copiedCmd === cmd.name ? 'Copied!' : 'Copy'}
                  </button>
                </div>
                <pre className="quick-action-command">{cmd.command}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
