import type { TaskTimelineEventType, UserRole } from './enums.js';

export interface TaskTimelineActorDto {
  id: string;
  name: string;
  email?: string;
  role?: UserRole;
}

export interface TaskTimelineEventDto {
  id: string;
  taskId: string;
  type: TaskTimelineEventType;
  title: string;
  description: string | null;
  metadata: Record<string, unknown> | null;
  actor: TaskTimelineActorDto | null;
  createdAt: string;
}
