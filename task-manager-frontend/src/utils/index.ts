import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import type { TaskStatus, UserRole } from '../types';
import { getRuntimeDateFormat } from './runtime-locale';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const { locale, timezone } = getRuntimeDateFormat();
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: timezone,
  });
}

export function formatDateTime(date: string | Date): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  const { locale, timezone } = getRuntimeDateFormat();
  return d.toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: timezone,
  });
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    minimumFractionDigits: 0,
  }).format(amount);
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map(n => n[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);
}

export const statusLabels: Record<TaskStatus, string> = {
  NEW: 'Необработано',
  IN_PROGRESS: 'В процессе',
  REVIEW: 'В процессе',
  DONE: 'Закрыто',
  POSTPONED: 'В процессе',
  REWORK: 'В процессе',
  MERGED: 'Объединено',
};

export const TASK_STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'NEW', label: statusLabels.NEW },
  { value: 'IN_PROGRESS', label: statusLabels.IN_PROGRESS },
  { value: 'DONE', label: statusLabels.DONE },
];

export const TASK_CREATION_STATUS_OPTIONS: Array<{ value: TaskStatus; label: string }> = [
  { value: 'NEW', label: statusLabels.NEW },
  { value: 'IN_PROGRESS', label: statusLabels.IN_PROGRESS },
  { value: 'DONE', label: statusLabels.DONE },
];

export const TASK_BOARD_COLUMNS: Array<{
  id: Extract<TaskStatus, 'NEW' | 'IN_PROGRESS' | 'DONE'>;
  title: string;
}> = [
  { id: 'NEW', title: 'Необработано' },
  { id: 'IN_PROGRESS', title: 'В процессе' },
  { id: 'DONE', title: 'Закрыто' },
];
const WORKFLOW_STATUS_OPTIONS: TaskStatus[] = ['NEW', 'IN_PROGRESS', 'DONE'];

const AGENT_STATUS_TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  NEW: ['IN_PROGRESS'],
  IN_PROGRESS: ['DONE'],
  REVIEW: ['IN_PROGRESS', 'DONE'],
  DONE: [],
  POSTPONED: ['IN_PROGRESS'],
  REWORK: ['IN_PROGRESS', 'DONE'],
  MERGED: [],
};

export const priorityLabels: Record<string, string> = {
  LOW: 'Низкий',
  MEDIUM: 'Средний',
  HIGH: 'Высокий',
  URGENT: 'Срочный',
};

type ProductRole = 'ADMIN' | 'AGENT' | 'REQUESTER' | 'VIEWER';

const PRODUCT_ROLE_MAP: Record<string, ProductRole> = {
  ADMIN: 'ADMIN',
  DIRECTOR: 'AGENT',
  MANAGER: 'AGENT',
  AGENT: 'AGENT',
  VIEWER: 'VIEWER',
  EMPLOYEE: 'AGENT',
  FINANCE: 'AGENT',
  USER: 'REQUESTER',
  REQUESTER: 'REQUESTER',
};

export const roleLabels: Record<string, string> = {
  ADMIN: 'Администратор',
  AGENT: 'Исполнитель',
  REQUESTER: 'Заявщик',
  VIEWER: 'Наблюдатель',
};

export const reviewStatusLabels: Record<string, string> = {
  PENDING: 'На рассмотрении',
  APPROVED: 'Подтверждено',
  REJECTED: 'Отклонено',
};

export const transactionTypeLabels: Record<string, string> = {
  INCOME: 'Доход',
  EXPENSE: 'Расход',
};

export function normalizeWorkflowStatus(status: string): TaskStatus | string {
  if (status === 'REVIEW' || status === 'POSTPONED' || status === 'REWORK') {
    return 'IN_PROGRESS';
  }

  return status;
}

export function getStatusLabel(status: string): string {
  const normalizedStatus = normalizeWorkflowStatus(status);
  return statusLabels[normalizedStatus as TaskStatus] || String(normalizedStatus);
}

export function getRoleLabel(role: string): string {
  const normalizedRole = PRODUCT_ROLE_MAP[role] || role;
  return roleLabels[normalizedRole] || normalizedRole;
}

export function getProductRole(role: string | undefined): ProductRole | string {
  if (!role) {
    return '';
  }

  return PRODUCT_ROLE_MAP[role] || role;
}

export function isAssignableRole(role: string | undefined): boolean {
  const productRole = getProductRole(role);
  return productRole === 'ADMIN' || productRole === 'AGENT';
}

export function getStatusColor(status: string): string {
  const colors: Record<string, string> = {
    NEW: 'bg-[#eef2ff] text-[#3f4b89] border border-[#d8defa]',
    IN_PROGRESS: 'bg-[#fff7e8] text-[#9a5f14] border border-[#f0dcb8]',
    REWORK: 'bg-[#fff7e8] text-[#9a5f14] border border-[#f0dcb8]',
    REVIEW: 'bg-[#fff7e8] text-[#9a5f14] border border-[#f0dcb8]',
    DONE: 'bg-[#e9f7ef] text-[#1f7a42] border border-[#b8e4c6]',
    POSTPONED: 'bg-[#fff7e8] text-[#9a5f14] border border-[#f0dcb8]',
    MERGED: 'bg-[#f2f2f2] text-[#4f4f4f] border border-[#d3d3d3]',
  };
  return colors[normalizeWorkflowStatus(status)] || 'bg-[#f2f2f2] text-[#5f5f5f] border border-[#dfdfdf]';
}

export function getAvailableTaskStatusOptions(
  currentStatus: TaskStatus,
  role: UserRole | undefined,
  options?: {
    isAssignee?: boolean;
    isAuthor?: boolean;
  }
): Array<{ value: TaskStatus; label: string }> {
  if (!role || role === 'VIEWER') {
    return [];
  }

  if (role === 'ADMIN') {
    return WORKFLOW_STATUS_OPTIONS
      .filter((status) => status !== currentStatus)
      .map((status) => ({
        value: status,
        label: statusLabels[status],
      }));
  }

  if (role === 'AGENT') {
    if (!options?.isAssignee) {
      return [];
    }
    return (AGENT_STATUS_TRANSITIONS[currentStatus] || []).map((status) => ({
      value: status,
      label: statusLabels[status],
    }));
  }

  return [];
}

export function getPriorityColor(priority: string): string {
  const colors: Record<string, string> = {
    LOW: 'text-green-400',
    MEDIUM: 'text-yellow-400',
    HIGH: 'text-orange-400',
    URGENT: 'text-red-400',
  };
  return colors[priority] || 'text-gray-400';
}
