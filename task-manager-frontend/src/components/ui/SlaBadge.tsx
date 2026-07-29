import React from 'react';
import type { SlaTimerStatus, TaskSla } from '../../types';
import { formatDateTime } from '../../utils';

const statusLabels: Record<SlaTimerStatus, string> = {
  PENDING: 'Ожидает',
  MET: 'В срок',
  BREACHED: 'Просрочено',
};

const statusClassNames: Record<SlaTimerStatus, string> = {
  PENDING: 'border-[#e5dfc8] bg-[#fff9eb] text-[#8c6b18]',
  MET: 'border-[#cfe4d7] bg-[#eef8f1] text-[#1f7a42]',
  BREACHED: 'border-[#efcaca] bg-[#fff0f0] text-[#a33b3b]',
};

const getStatusLabel = (status: SlaTimerStatus | null | undefined) =>
  status ? statusLabels[status] : 'Не задано';

const getStatusClassName = (status: SlaTimerStatus | null | undefined) =>
  status ? statusClassNames[status] : 'border-[#e3e3e3] bg-[#f7f7f7] text-[#7a7a7a]';

const formatSlaDate = (value?: string | null) =>
  value ? formatDateTime(value) : 'Не задано';

interface SlaStatusPillProps {
  label: string;
  status: SlaTimerStatus | null | undefined;
}

export const SlaStatusPill: React.FC<SlaStatusPillProps> = ({ label, status }) => (
  <span className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${getStatusClassName(status)}`}>
    {label}: {getStatusLabel(status)}
  </span>
);

interface TaskSlaCompactBadgeProps {
  sla?: TaskSla;
  testId?: string;
}

export const TaskSlaCompactBadge: React.FC<TaskSlaCompactBadgeProps> = ({ sla, testId }) => {
  if (!sla?.policy) {
    return null;
  }

  return (
    <div
      className="rounded-[12px] border border-[#e5e5e5] bg-[#fcfcfc] px-3 py-2"
      data-testid={testId}
    >
      <div className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#848484]">
        SLA
      </div>
      <div className="mt-1 text-sm font-medium text-[#2a2a2a]">{sla.policy.name}</div>
      <div className="mt-2 flex flex-wrap gap-2">
        <SlaStatusPill label="1-й ответ" status={sla.firstResponseStatus} />
        <SlaStatusPill label="Решение" status={sla.resolutionStatus} />
      </div>
    </div>
  );
};

interface TaskSlaPanelProps {
  sla?: TaskSla;
  testId?: string;
}

export const TaskSlaPanel: React.FC<TaskSlaPanelProps> = ({ sla, testId }) => {
  if (!sla?.policy) {
    return (
      <div
        className="rounded-[12px] border border-dashed border-[#dddddd] bg-[#fcfcfc] p-4 text-sm text-[#6c6c6c]"
        data-testid={testId}
      >
        SLA для этой заявки не назначен.
      </div>
    );
  }

  return (
    <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] p-4 space-y-3" data-testid={testId}>
      <div>
        <div className="text-sm font-semibold text-[#1f1f1f]">SLA</div>
        <p className="mt-1 text-sm text-[#727272]">
          {sla.policy.name}
          {sla.policy.description ? ` · ${sla.policy.description}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-3">
          <div className="text-xs text-[#8a8a8a]">Срок первого ответа</div>
          <div className="mt-1 text-sm font-medium text-[#1f1f1f]">{formatSlaDate(sla.firstResponseDueAt)}</div>
          <div className="mt-2">
            <SlaStatusPill label="Статус" status={sla.firstResponseStatus} />
          </div>
        </div>

        <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-3">
          <div className="text-xs text-[#8a8a8a]">Срок решения</div>
          <div className="mt-1 text-sm font-medium text-[#1f1f1f]">{formatSlaDate(sla.resolutionDueAt)}</div>
          <div className="mt-2">
            <SlaStatusPill label="Статус" status={sla.resolutionStatus} />
          </div>
        </div>

        <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-3">
          <div className="text-xs text-[#8a8a8a]">Первый ответ зафиксирован</div>
          <div className="mt-1 text-sm font-medium text-[#1f1f1f]">{formatSlaDate(sla.firstResponseAt)}</div>
        </div>

        <div className="rounded-[10px] border border-[#ececec] bg-white px-3 py-3">
          <div className="text-xs text-[#8a8a8a]">Заявка решена</div>
          <div className="mt-1 text-sm font-medium text-[#1f1f1f]">{formatSlaDate(sla.resolvedAt)}</div>
        </div>
      </div>
    </div>
  );
};
