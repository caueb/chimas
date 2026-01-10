import React from 'react';

interface KeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  title: string;
  shortcuts: {
    keys: string[];
    description: string;
  }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: 'Navigation',
    shortcuts: [
      { keys: ['Arrow Up'], description: 'Select previous result' },
      { keys: ['Arrow Down'], description: 'Select next result' },
      { keys: ['Esc'], description: 'Close detail panel' },
      { keys: ['/'], description: 'Focus search input' }
    ]
  },
  {
    title: 'Actions',
    shortcuts: [
      { keys: ['F'], description: 'Toggle false positive' },
      { keys: ['?'], description: 'Show keyboard shortcuts' }
    ]
  }
];

export const KeyboardShortcutsModal: React.FC<KeyboardShortcutsModalProps> = ({
  isOpen,
  onClose
}) => {
  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content keyboard-shortcuts-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Keyboard Shortcuts</h2>
          <button className="modal-close-button" onClick={onClose}>
            <i className="fas fa-times"></i>
          </button>
        </div>

        <div className="modal-body">
          {SHORTCUT_GROUPS.map((group, groupIndex) => (
            <div key={groupIndex} className="shortcut-group">
              <h3>{group.title}</h3>
              <div className="shortcut-list">
                {group.shortcuts.map((shortcut, shortcutIndex) => (
                  <div key={shortcutIndex} className="shortcut-item">
                    <div className="shortcut-keys">
                      {shortcut.keys.map((key, keyIndex) => (
                        <React.Fragment key={keyIndex}>
                          <kbd className="shortcut-key">{key}</kbd>
                          {keyIndex < shortcut.keys.length - 1 && (
                            <span className="shortcut-separator">+</span>
                          )}
                        </React.Fragment>
                      ))}
                    </div>
                    <div className="shortcut-description">{shortcut.description}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="modal-footer">
          <p className="shortcut-hint">
            Press <kbd>?</kbd> anytime to show this dialog
          </p>
        </div>
      </div>
    </div>
  );
};
