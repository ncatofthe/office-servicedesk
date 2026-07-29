import React from 'react';
import { CalendarDays } from 'lucide-react';
import { ProgressBar } from './ProgressBar';
import { AvatarGroup } from './AvatarGroup';
import { TaskSlaCompactBadge } from './SlaBadge';
import type { TaskSummary } from '../../types';
import { getStatusColor, getStatusLabel, priorityLabels } from '../../utils';

interface TaskCardProps {
  task: TaskSummary;
  onClick?: () => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onClick }) => {
  const assigneeNames = task.assignees?.map((a) => a.user.name) || [];
  const displayNumber = task.displayNumber || (typeof task.ticketNumber === 'number' ? `#${task.ticketNumber}` : null);
  const typeSummary = [task.type?.name, task.subtype?.name].filter(Boolean).join(' · ');
  const showProgress = (task.progress || 0) > 0 && task.status !== 'NEW' && task.status !== 'DONE';
  const priorityTone: Record<string, string> = {
    LOW: 'bg-[#eef6f1] text-[#336948] border border-[#cfe4d7]',
    MEDIUM: 'bg-[#f5f5f5] text-[#555555] border border-[#e1e1e1]',
    HIGH: 'bg-[#fff6e8] text-[#8f5a18] border border-[#f0ddbb]',
    URGENT: 'bg-[#fff0f0] text-[#a33b3b] border border-[#efcaca]',
  };

  return (
    <div
      className="card cursor-pointer space-y-4 border-[#dedede] bg-[linear-gradient(180deg,#ffffff_0%,#fcfcfc_100%)] p-4"
      onClick={onClick}
      data-testid="task-card"
      data-task-id={task.id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {displayNumber && (
              <span className="rounded-full bg-[#2f2f2f] px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_6px_16px_rgba(0,0,0,0.14)]">
                <span data-testid="task-card-ticket-number">{displayNumber}</span>
              </span>
            )}
            {(task.folder?.name || task.department?.name) && (
              <span className="rounded-[8px] border border-[#e3e3e3] bg-[#f6f6f6] px-2 py-1 text-[11px] font-medium text-[#5e5e5e]">
                {task.folder?.name || task.department?.name}
              </span>
            )}
          </div>
          <div className="line-clamp-2 text-[17px] font-semibold leading-tight text-[#1b1b1b]">{task.title}</div>
        </div>

        <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${priorityTone[task.priority] || priorityTone.MEDIUM}`}>
          {priorityLabels[task.priority] || task.priority}
        </span>
      </div>

      <p className="line-clamp-2 text-sm leading-6 text-[#676767]">{task.description || 'Описание не указано'}</p>

      {typeSummary && (
        <p className="text-xs font-medium text-[#8a8a8a]">{typeSummary}</p>
      )}

      {task.sla?.policy && (
        <TaskSlaCompactBadge sla={task.sla} testId="task-card-sla" />
      )}

      {showProgress && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] text-[#8a8a8a]">
            <span>Прогресс</span>
            <span>{task.progress}%</span>
          </div>
          <ProgressBar value={task.progress || 0} />
        </div>
      )}

      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <span className={`inline-flex min-h-[28px] items-center rounded-[8px] px-2.5 py-1 text-[11px] font-semibold ${getStatusColor(task.status)}`}>
            {getStatusLabel(task.status)}
          </span>
          {task.dueDate && (
            <div className="flex items-center gap-1 text-xs text-[#8a8a8a]">
              <CalendarDays size={12} />
              <span>До {new Date(task.dueDate).toLocaleDateString('ru-RU')}</span>
            </div>
          )}
        </div>

        {assigneeNames.length > 0 ? (
          <AvatarGroup names={assigneeNames} />
        ) : (
          <span className="text-xs font-medium text-[#9a9a9a]">Без исполнителя</span>
        )}
      </div>
    </div>
  );
};
