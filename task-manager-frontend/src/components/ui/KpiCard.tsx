import React from 'react';
import { Card } from './Card';
import { ProgressBar } from './ProgressBar';

export const KpiCard: React.FC<{ label: string; value: string | number; progress?: number }> = ({ label, value, progress }) => (
  <Card padding="md" className="space-y-2">
    <p className="text-sm text-[#6b6b6b]">{label}</p>
    <div className="text-[30px] leading-none font-semibold text-[#1f1f1f]">{value}</div>
    {typeof progress === 'number' && (
      <div>
        <ProgressBar value={progress} />
        <p className="text-xs text-[#7b7b7b] mt-1">{Math.min(100, Math.max(0, progress)).toFixed(0)}%</p>
      </div>
    )}
  </Card>
);
