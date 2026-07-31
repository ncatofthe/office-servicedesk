import React from 'react';
import type { TeamUser } from '../../types';
import { getRoleLabel } from '../../utils';
import { UserAvatar } from './UserAvatar';

interface AssigneeCheckboxListProps {
  users: TeamUser[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  disabled?: boolean;
  emptyMessage?: string;
}

export const AssigneeCheckboxList: React.FC<AssigneeCheckboxListProps> = ({
  users,
  selectedIds,
  onChange,
  disabled = false,
  emptyMessage = 'Нет доступных исполнителей.',
}) => {
  const selected = new Set(selectedIds);

  if (users.length === 0) {
    return <p className="rounded-[10px] border border-dashed border-[#dedede] bg-[#fafafa] px-3 py-4 text-sm text-[#808080]">{emptyMessage}</p>;
  }

  return (
    <div className="max-h-56 space-y-1 overflow-y-auto rounded-[10px] border border-[#dedede] bg-white p-1.5">
      {users.map((candidate) => {
        const checked = selected.has(candidate.id);
        return (
          <label
            key={candidate.id}
            className={`flex cursor-pointer items-center gap-3 rounded-[9px] px-2.5 py-2 transition ${checked ? 'bg-[#eef3fa]' : 'hover:bg-[#f7f7f6]'} ${disabled ? 'cursor-not-allowed opacity-60' : ''}`}
          >
            <input
              type="checkbox"
              className="h-4 w-4 shrink-0 accent-[#2d3c54]"
              checked={checked}
              disabled={disabled}
              onChange={(event) => {
                onChange(event.target.checked
                  ? [...selectedIds, candidate.id]
                  : selectedIds.filter((id) => id !== candidate.id));
              }}
              aria-label={`Назначить исполнителя ${candidate.name}`}
            />
            <UserAvatar name={candidate.name} avatar={candidate.avatar} className="h-8 w-8 bg-[#2d3c54] text-[10px] text-white" />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-[#2d3137]">{candidate.name}</span>
              <span className="block truncate text-[11px] text-[#858b93]">{candidate.position || getRoleLabel(candidate.role)}</span>
            </span>
          </label>
        );
      })}
    </div>
  );
};
