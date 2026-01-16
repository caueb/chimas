import React from 'react';

interface SpinnerProps {
  size?: 'small' | 'medium' | 'large';
  label?: string;
}

export const Spinner: React.FC<SpinnerProps> = ({
  size = 'medium',
  label = 'Loading...'
}) => {
  return (
    <div className={`spinner spinner-${size}`} role="status" aria-label={label}>
      <div className="spinner-circle"></div>
      {label && <span className="spinner-label">{label}</span>}
    </div>
  );
};
