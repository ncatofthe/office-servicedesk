import React from 'react';

export interface TabItem {
  key: string;
  label: string;
}

interface TabsProps {
  tabs: TabItem[];
  value: string;
  onChange: (key: string) => void;
  ariaLabel?: string;
}

export const Tabs: React.FC<TabsProps> = ({ tabs, value, onChange, ariaLabel = 'Разделы' }) => (
  <div role="tablist" aria-label={ariaLabel}>
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap">
    {tabs.map((t) => {
      const active = t.key === value;
      return (
        <button
          key={t.key}
          type="button"
          onClick={() => onChange(t.key)}
          role="tab"
          aria-selected={active}
          className={`h-10 min-w-0 rounded-[10px] border px-3 text-sm font-medium leading-tight transition-all lg:w-auto lg:shrink-0 lg:px-4 ${
            active
              ? 'bg-[#2f2f2f] text-white border-[#2f2f2f] shadow-[0_8px_20px_rgba(0,0,0,0.12)]'
              : 'bg-white border-[#dddddd] text-[#535353] hover:border-[#bfbfbf]'
          }`}
        >
          {t.label}
        </button>
      );
    })}
    </div>
  </div>
);
