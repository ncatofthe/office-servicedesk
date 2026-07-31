import React from 'react';
import { ProgressBar } from './ProgressBar';
import { UserAvatar } from './UserAvatar';

export const UserCard: React.FC<{
  name: string;
  avatar?: string | null;
  role: string;
  done: number;
  total: number;
  extraTop?: string | null;
  skills?: string;
  isActive?: boolean;
  onClick?: () => void;
}> = ({ name, avatar, role, done, total, extraTop, skills, isActive = true, onClick }) => {
  const percent = Math.round((done / Math.max(1, total)) * 100);
  return (
    <button
      type="button"
      onClick={onClick}
      className="card w-full p-4 space-y-3 text-left transition hover:border-[#cfcfcf] hover:shadow-[0_12px_26px_rgba(0,0,0,0.08)] focus:outline-none focus:ring-2 focus:ring-[#2f2f2f]/20"
      data-testid="team-user-card"
    >
      <div className="flex items-center gap-3">
        <UserAvatar name={name} avatar={avatar} className="h-11 w-11 bg-[#2f2f2f] text-sm text-white" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-[#1f1f1f]">{name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${isActive ? 'bg-[#eef9f2] text-[#1f7a42]' : 'bg-[#f0f0f0] text-[#666666]'}`}>
              {isActive ? 'Активен' : 'Отключён'}
            </span>
          </div>
          {extraTop && <p className="text-xs text-[#8a8a8a]">{extraTop}</p>}
          <p className="text-sm text-[#575757]">{role}</p>
        </div>
      </div>
      <ProgressBar value={percent} />
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-[#686868]">{done} / {total} заявок</p>
        <span className="text-xs font-medium text-[#2f2f2f]">Подробнее</span>
      </div>
      {skills && <p className="text-xs text-[#8a8a8a]">Навыки: {skills}</p>}
    </button>
  );
};
