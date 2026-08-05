import type { DepartmentSummaryDto } from './auth.js';
import type {
  CommentVisibility,
  SlaTimerStatus,
  TaskPriority,
  TaskStatus,
  UserRole,
} from './enums.js';
import type { TaskReviewDto } from './reviews.js';

export interface TaskAuthorDto {
  id: string;
  name: string;
  avatar?: string | null;
  email: string;
  role: UserRole;
  position?: string | null;
  department?: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskAssigneeUserDto {
  id: string;
  name: string;
  avatar?: string | null;
  role: UserRole;
}

export interface TaskAssigneeDto {
  id: string;
  taskId?: string;
  userId: string;
  user: TaskAssigneeUserDto;
}

export interface TaskTeamDto {
  id: string;
  name: string;
  description?: string | null;
  isActive: boolean;
}

export interface TaskCommentAuthorDto {
  id: string;
  name: string;
  avatar?: string | null;
}

export interface TaskCommentDto {
  id: string;
  content: string;
  visibility: CommentVisibility;
  taskId: string;
  authorId: string;
  author: TaskCommentAuthorDto;
  createdAt: string;
}

export interface TaskAttachmentDto {
  id: string;
  filename: string;
  /**
   * Temporary/unstable: the public API currently exposes this field as a
   * download URL string, while the backend stores an internal file path.
   * Keep it for compatibility until response serialization is normalized.
   */
  path: string;
  taskId: string;
  uploadedById: string;
  createdAt: string;
}

export interface TaskCountsDto {
  comments: number;
  assignees: number;
}

export interface TaskSlaPolicyDto {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  folderId?: string | null;
  typeId?: string | null;
  subtypeId?: string | null;
  priority?: TaskPriority | null;
  firstResponseMinutes?: number | null;
  resolutionMinutes?: number | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskSlaDto {
  policy: TaskSlaPolicyDto | null;
  firstResponseDueAt?: string | null;
  resolutionDueAt?: string | null;
  firstResponseAt?: string | null;
  resolvedAt?: string | null;
  firstResponseStatus: SlaTimerStatus | null;
  resolutionStatus: SlaTimerStatus | null;
}

export interface TaskBaseDto {
  id: string;
  ticketNumber: number;
  displayNumber: string;
  title: string;
  description?: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  sourceChannel?: 'WEB' | 'EMAIL';
  startDate?: string | null;
  dueDate?: string | null;
  progress: number;
  departmentId?: string | null;
  teamId?: string | null;
  folderId?: string | null;
  entityId?: string | null;
  typeId?: string | null;
  subtypeId?: string | null;
  authorId: string;
  requesterCloseRequired?: boolean;
  requesterCloseApprovedAt?: string | null;
  requesterCloseApprovedById?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TaskSummaryDto extends TaskBaseDto {
  department?: DepartmentSummaryDto | null;
  team?: TaskTeamDto | null;
  author?: TaskAuthorDto;
  assignees?: TaskAssigneeDto[];
  sla?: TaskSlaDto;
  _count?: TaskCountsDto;
}

export interface TaskDetailDto extends TaskSummaryDto {
  comments?: TaskCommentDto[];
  attachments?: TaskAttachmentDto[];
  latestReview?: TaskReviewDto | null;
}

export interface TasksListQueryDto {
  limit?: number;
  offset?: number;
  status?: TaskStatus;
  priority?: TaskPriority;
  search?: string;
  title?: string;
  scope?: 'all' | 'mine';
  channel?: 'WEB' | 'EMAIL';
  updatedAfter?: string;
  sortBy?: 'created' | 'updated' | 'number';
  sortOrder?: 'asc' | 'desc';
  authorId?: string;
  assigneeId?: string;
  teamId?: string;
  folderId?: string;
  entityId?: string;
  typeId?: string;
  subtypeId?: string;
  startDateAfter?: string;
  dueDateBefore?: string;
}

export interface CreateTaskRequestDto {
  title: string;
  description?: string;
  priority?: TaskPriority;
  status?: TaskStatus;
  startDate?: string;
  dueDate?: string;
  departmentId?: string | null;
  teamId?: string | null;
  folderId?: string | null;
  entityId?: string | null;
  typeId?: string | null;
  subtypeId?: string | null;
  assigneeIds?: string[];
  sourceChannel?: 'WEB' | 'EMAIL';
}

export interface UpdateTaskRequestDto {
  title?: string;
  description?: string | null;
  priority?: TaskPriority;
  startDate?: string | null;
  dueDate?: string | null;
  progress?: number;
  departmentId?: string | null;
  teamId?: string | null;
  folderId?: string | null;
  entityId?: string | null;
  typeId?: string | null;
  subtypeId?: string | null;
  requesterCloseRequired?: boolean;
  assigneeIds?: string[];
}

export interface UpdateTaskStatusRequestDto {
  status: TaskStatus;
}

export interface TasksListResponseDto {
  tasks: TaskSummaryDto[];
  total: number;
  limit: number;
  offset: number;
}
