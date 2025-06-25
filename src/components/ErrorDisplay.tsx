import React from 'react';

interface ErrorDisplayProps {
  errorMessage: string;
  fileSnippet?: string;
  errorPosition?: number;
  fileName?: string;
  fileType?: string;
  actualLineNumber?: number;
  snippetStartLine?: number;
  onClearError: () => void;
}

export const ErrorDisplay: React.FC<ErrorDisplayProps> = ({ 
  errorMessage, 
  fileSnippet, 
  errorPosition, 
  fileName, 
  fileType,
  actualLineNumber,
  snippetStartLine,
  onClearError 
}) => {
  // Simple syntax highlighter for JSON
  const highlightJson = (jsonString: string) => {
    // First escape HTML to prevent issues
    let highlighted = jsonString
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // Highlight strings (including property names and values)
    highlighted = highlighted.replace(/"([^"\\]*(\\.[^"\\]*)*)"/g, '<span class="json-string">"$1"</span>');
    
    // Highlight numbers (integers and floats)
    highlighted = highlighted.replace(/\b(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)\b/g, '<span class="json-number">$1</span>');
    
    // Highlight boolean and null values
    highlighted = highlighted.replace(/\b(true|false|null)\b/g, '<span class="json-boolean">$1</span>');
    
    // Highlight punctuation
    highlighted = highlighted.replace(/([{}[\],])/g, '<span class="json-punctuation">$1</span>');
    
    // Highlight colons separately for better control
    highlighted = highlighted.replace(/:/g, '<span class="json-punctuation">:</span>');
    
    // Now specifically target property names (strings followed by colon)
    // This needs to come after string highlighting to override it
    highlighted = highlighted.replace(/<span class="json-string">("[^"]*")<\/span>\s*<span class="json-punctuation">:<\/span>/g, 
      '<span class="json-key">$1</span><span class="json-punctuation">:</span>');
    
    return highlighted;
  };

  // Simple syntax highlighter for log text
  const highlightLogText = (logString: string) => {
    return logString
      .replace(/(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})/g, '<span class="log-timestamp">$1</span>')
      .replace(/(\[\d+\])/g, '<span class="log-thread">$1</span>')
      .replace(/(\(.*?\))/g, '<span class="log-process">$1</span>')
      .replace(/(\[File\]|\[Share\]|\[Info\]|\[Warn\])/g, '<span class="log-type">$1</span>')
      .replace(/(<Red>.*?<\/Red>)/g, '<span class="log-red">$1</span>')
      .replace(/(<Yellow>.*?<\/Yellow>)/g, '<span class="log-yellow">$1</span>')
      .replace(/(<Green>.*?<\/Green>)/g, '<span class="log-green">$1</span>')
      .replace(/(<Black>.*?<\/Black>)/g, '<span class="log-black">$1</span>')
      .replace(/(#.*$)/gm, '<span class="log-comment">$1</span>');
  };

  const getErrorType = (message: string): { type: string; description: string; expectedExample: string; suggestions: string[] } => {
    if (message.includes('JSON') || message.includes('parse') || message.includes('entries is undefined')) {
      return {
        type: 'JSON Parsing Error',
        description: 'The JSON file appears to be malformed or contains invalid syntax.',
        expectedExample: `{
  "entries": [
    {
      "time": "2024-01-15T10:30:00.000Z",
      "level": "Warn", 
      "message": "[File] <Red>C:\\\\Users\\\\admin\\\\password.txt</Red>",
      "eventProperties": {
        "Red": {
          "FileResult": {
            "FileInfo": {
              "FullName": "C:\\\\Users\\\\admin\\\\password.txt",
              "Name": "password.txt",
              "Length": 1024
            },
            "TextResult": {
              "MatchContext": "password=admin123",
              "MatchedStrings": ["password"]
            },
            "MatchedRule": {
              "RuleName": "KeepConfigRegexRed"
            }
          }
        }
      }
    }
  ]
}`,
        suggestions: [
          'Check if the file is a valid JSON file exported from Snaffler',
          'Ensure there are no missing brackets, quotes, or commas',
          'Verify the file wasn\'t corrupted during transfer',
          'Use a JSON validator tool to check for syntax errors'
        ]
      };
    } else if (message.includes('valid Snaffler output') || message.includes('entries is undefined')) {
      const getFormatExample = () => {
        if (fileType === 'json') {
          return `{
  "entries": [
    {
      "time": "2024-01-15T10:30:00.000Z",
      "level": "Warn", 
      "message": "[File] <Red>C:\\\\Users\\\\admin\\\\password.txt</Red>",
      "eventProperties": {
        "Red": {
          "FileResult": {
            "FileInfo": {
              "FullName": "C:\\\\Users\\\\admin\\\\password.txt",
              "Name": "password.txt",
              "Length": 1024
            },
            "TextResult": {
              "MatchContext": "password=admin123",
              "MatchedStrings": ["password"]
            },
            "MatchedRule": {
              "RuleName": "KeepConfigRegexRed"
            }
          }
        }
      }
    },
    {
      "time": "2024-01-15T10:31:00.000Z",
      "level": "Warn",
      "message": "[File] <Yellow>C:\\\\Documents\\\\config.xml</Yellow>",
      "eventProperties": { ... }
    }
  ]
}`;
        } else {
          return `2024-01-15 10:30:00 [1] (Snaffler) [File] <Red>C:\\\\Users\\\\admin\\\\password.txt</Red>
2024-01-15 10:30:01 [1] (Snaffler) [File] <Yellow>C:\\\\Documents\\\\config.xml</Yellow>
2024-01-15 10:30:02 [1] (Snaffler) [File] <Green>C:\\\\temp\\\\notes.txt</Green>
2024-01-15 10:30:03 [1] (Snaffler) [Share] <Yellow>\\\\server01\\\\shared\\\\sensitive</Yellow>

# Alternative timestamp formats also supported:
15/01/2024 10:30:00 [File] <Red>C:\\\\sensitive\\\\passwords.txt</Red>
Jan 15 10:31:00 [File] <Black>C:\\\\documents\\\\normal.pdf</Black>`;
        }
      };

      const getFormatSuggestions = () => {
        if (fileType === 'json') {
          return [
            'Ensure the file is a valid JSON export from Snaffler',
            'Check if the file contains the expected "entries" array structure',
            'Verify each entry has "time", "level", "message" and "eventProperties" fields',
            'Make sure you\'re using a recent version of Snaffler that outputs JSON format'
          ];
        } else {
          return [
            'Ensure the file is an actual text log output from Snaffler tool',
            'Verify the file contains Snaffler log entries with [File] or [Share] markers',
            'Check that entries have color tags like <Red>, <Yellow>, <Green>, <Black>',
            'Make sure the log wasn\'t truncated or corrupted during transfer'
          ];
        }
      };

      return {
        type: 'Invalid Snaffler Format',
        description: 'The file was parsed successfully but doesn\'t contain valid Snaffler output data.',
        expectedExample: getFormatExample(),
        suggestions: getFormatSuggestions()
      };
    } else if (message.includes('empty')) {
      return {
        type: 'Empty File',
        description: 'The file appears to be empty or contains no parseable Snaffler data.',
        expectedExample: `2024-01-15 10:30:00 [Info] Snaffler started
2024-01-15 10:30:01 [Warn] [File] <Red>C:\\\\Users\\\\admin\\\\secrets.txt</Red>
2024-01-15 10:30:02 [Warn] [Share] <Yellow>\\\\server\\\\confidential</Yellow>
2024-01-15 10:30:03 [Info] Snaffler finished`,
        suggestions: [
          'Check if the Snaffler scan actually found any files',
          'Verify the file was completely downloaded/copied',
          'Try running Snaffler again with different parameters',
          'Ensure the target directories had accessible files during the scan'
        ]
      };
    } else {
      return {
        type: 'Unknown Error',
        description: 'An unexpected error occurred while processing the file.',
        expectedExample: `Valid Snaffler JSON or text log file with scan results.`,
        suggestions: [
          'Try refreshing the page and uploading again',
          'Check the browser console for more details',
          'Verify the file is not corrupted',
          'Contact support if the issue persists'
        ]
      };
    }
  };

  const errorInfo = getErrorType(errorMessage);

  const renderFileSnippet = () => {
    if (!fileSnippet) return null;

    // Split the snippet into lines for better error highlighting
    const lines = fileSnippet.split('\n');
    
    // Calculate which line in the snippet is the error line
    let errorLineIndex = -1;
    if (actualLineNumber && snippetStartLine) {
      // Calculate the error line index within the snippet
      errorLineIndex = actualLineNumber - snippetStartLine;
    } else if (errorPosition !== undefined) {
      // Fallback to position-based calculation
      let currentPosition = 0;
      for (let i = 0; i < lines.length; i++) {
        const lineLength = lines[i].length + 1; // +1 for newline character
        if (currentPosition + lineLength > errorPosition) {
          errorLineIndex = i;
          break;
        }
        currentPosition += lineLength;
      }
    }
    
    // If we couldn't find the line (edge case), don't highlight any line
    if (errorLineIndex < 0 || errorLineIndex >= lines.length) {
      errorLineIndex = -1;
    }
    
    return (
      <pre>
        <code>
          {lines.map((line, index) => {
            // Calculate the actual file line number
            const actualFileLineNum = snippetStartLine ? snippetStartLine + index : index + 1;
            
            if (index === errorLineIndex) {
              return (
                <div key={index} className="error-line">
                  <span className="line-number">{actualFileLineNum}</span>
                  <span className="error-highlight-line">{line}</span>
                </div>
              );
            } else {
              return (
                <div key={index} className="normal-line">
                  <span className="line-number">{actualFileLineNum}</span>
                  <span className="line-content">{line}</span>
                </div>
              );
            }
          })}
        </code>
      </pre>
    );
  };

  const renderExpectedFormat = () => {
    const isJsonFormat = fileType === 'json' || errorInfo.expectedExample.trim().startsWith('{');
    const highlightedCode = isJsonFormat 
      ? highlightJson(errorInfo.expectedExample)
      : highlightLogText(errorInfo.expectedExample);
    
    return (
      <div className="expected-format-box">
        <pre>
          <code dangerouslySetInnerHTML={{ __html: highlightedCode }} />
        </pre>
      </div>
    );
  };

  return (
    <div className="error-display-container">
      <div className="error-content">
        <div className="error-header">
          <i className="fas fa-exclamation-triangle error-icon"></i>
          <h2>File Parsing Error</h2>
        </div>
        


        <div className="error-details">
          <h4>Technical Details</h4>
          <div className="error-message-box">
            <code>{errorMessage}</code>
          </div>
        </div>

        {fileSnippet && (
          <div className="file-snippet">
            <h4>File Content Preview</h4>
            <p className="snippet-description">
              {errorPosition !== undefined 
                ? "The highlighted line shows approximately where the error was detected:"
                : "Here's a preview of the file content where the error might be located:"
              }
            </p>
            <div className="snippet-container">
              {renderFileSnippet()}
            </div>
          </div>
        )}

        <div className="error-expected">
          <h4>Expected Format</h4>
          {renderExpectedFormat()}
        </div>

        <div className="error-suggestions">
          <h4>Suggestions to Fix This Issue</h4>
          <ul>
            {errorInfo.suggestions.map((suggestion, index) => (
              <li key={index}>{suggestion}</li>
            ))}
          </ul>
        </div>

        <div className="error-actions">
          <button onClick={onClearError} className="action-button primary-button">
            <i className="fas fa-arrow-left"></i> Go Back and Try Another File
          </button>
        </div>
      </div>
    </div>
  );
}; 