import React from 'react';

export const AvatarGroup: React.FC<{ names: string[] }> = ({ names }) => {
  const initials = (name: string) => name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  return (
    <div className="flex -space-x-2">
      {names.slice(0, 4).map((n, i) => (
        <div
          key={i}
          className="w-8 h-8 rounded-full border border-white bg-[#2f2f2f] text-white text-[10px] font-semibold flex items-center justify-center shadow-[0_4px_10px_rgba(0,0,0,0.18)]"
          title={n}
        >
          {initials(n)}
        </div>
      ))}
      {names.length > 4 && (
        <div className="w-8 h-8 rounded-full border border-white bg-[#e9e9e9] text-[#5f5f5f] text-[10px] font-semibold flex items-center justify-center">
          +{names.length - 4}
        </div>
      )}
    </div>
  );
};
