import React, { useState, useEffect, useCallback } from 'react';

type ToastType = 'success' | 'info' | 'error';

interface ToastMessage {
  id: number;
  message: string;
  type: ToastType;
}

interface ToastProps {
  duration?: number;
}

// Global toast state and listeners
let toastIdCounter = 0;
let listeners: ((toast: ToastMessage) => void)[] = [];

// Imperative function to show toast
export const showToast = (message: string, type: ToastType = 'info'): void => {
  const toast: ToastMessage = {
    id: ++toastIdCounter,
    message,
    type
  };
  listeners.forEach(listener => listener(toast));
};

export const Toast: React.FC<ToastProps> = ({ duration = 3000 }) => {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const addToast = useCallback((toast: ToastMessage) => {
    setToasts(prev => [...prev, toast]);

    // Auto-dismiss after duration
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== toast.id));
    }, duration);
  }, [duration]);

  // Subscribe to toast events
  useEffect(() => {
    listeners.push(addToast);
    return () => {
      listeners = listeners.filter(l => l !== addToast);
    };
  }, [addToast]);

  const handleDismiss = (id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  };

  if (toasts.length === 0) return null;

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <div
          key={toast.id}
          className={`toast toast-${toast.type}`}
          onClick={() => handleDismiss(toast.id)}
          role="alert"
        >
          <span className="toast-icon">
            {toast.type === 'success' && <i className="fas fa-check-circle"></i>}
            {toast.type === 'info' && <i className="fas fa-info-circle"></i>}
            {toast.type === 'error' && <i className="fas fa-exclamation-circle"></i>}
          </span>
          <span className="toast-message">{toast.message}</span>
          <button
            className="toast-close"
            onClick={(e) => { e.stopPropagation(); handleDismiss(toast.id); }}
            aria-label="Dismiss"
          >
            <i className="fas fa-times"></i>
          </button>
        </div>
      ))}
    </div>
  );
};
