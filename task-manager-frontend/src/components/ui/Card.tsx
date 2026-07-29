import React from 'react';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: 'sm' | 'md' | 'lg';
}

export const Card: React.FC<CardProps> = ({ children, className = '', padding = 'md', ...rest }) => {
  const pad = padding === 'sm' ? 'p-3' : padding === 'lg' ? 'p-6' : 'p-5';
  return (
    <div
      className={`card ${pad} ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
};
