import type { NotificationKind } from './enums.js';

export interface NotificationTaskDto {
  id: string;
  ticketNumber?: number | null;
  title: string;
}

export interface NotificationDto {
  id: string;
  type: NotificationKind | string;
  title: string;
  message: string;
  isRead: boolean;
  readAt: string | null;
  taskId: string | null;
  task: NotificationTaskDto | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationsListResponseDto {
  items: NotificationDto[];
  nextCursor: string | null;
}

export interface NotificationUnreadCountDto {
  unreadCount: number;
}
