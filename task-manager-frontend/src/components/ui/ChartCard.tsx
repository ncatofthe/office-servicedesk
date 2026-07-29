import React from 'react';
import { Card } from './Card';

interface ChartCardProps {
  title: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export const ChartCard: React.FC<ChartCardProps> = ({ title, actions, children }) => (
  <Card padding="md" className="min-w-0 space-y-4">
    <div className="flex items-center justify-between">
      <p className="text-[18px] font-semibold text-[#1f1f1f] leading-tight">{title}</p>
      {actions}
    </div>
    {children}
  </Card>
);
