import React from 'react';

export const ProgressBar: React.FC<{ value: number }> = ({ value }) => (
  <div className="progress">
    <div className="progress-bar" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
  </div>
);
