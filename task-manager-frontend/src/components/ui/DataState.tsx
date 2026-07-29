import React from 'react';
import { Loader2 } from 'lucide-react';

type DataStateVariant = 'loading' | 'error' | 'empty';

interface DataStateProps {
  variant: DataStateVariant;
  message: string;
}

const variantClassNames: Record<DataStateVariant, string> = {
  loading: 'border-[#e3e3e3] bg-white text-[#6b6b6b]',
  error: 'border-[#f3c4c4] bg-[#fff4f4] text-[#b23b3b]',
  empty: 'border-[#e3e3e3] bg-[#fcfcfc] text-[#6b6b6b]',
};

export const DataState: React.FC<DataStateProps> = ({ variant, message }) => {
  return (
    <div className={`col-span-full rounded-[16px] border px-5 py-8 text-center text-sm ${variantClassNames[variant]}`}>
      <div className="mx-auto flex max-w-[420px] flex-col items-center gap-3 leading-6">
        {variant === 'loading' && <Loader2 size={18} className="animate-spin text-[#6b6b6b]" />}
        <div>{message}</div>
      </div>
    </div>
  );
};
