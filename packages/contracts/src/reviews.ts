import type { TaskReviewStatus, UserRole } from './enums.js';

export interface ReviewEmployeeDto {
  id: string;
  name: string;
  role: UserRole;
}

export interface ReviewListItemDto {
  id: string;
  reviewId: string | null;
  title: string;
  employee: ReviewEmployeeDto;
  role: UserRole;
  date: string;
  status: TaskReviewStatus;
  amount?: number | null;
  comment?: string | null;
}

/**
 * Temporary/unstable: PATCH /reviews/:id currently returns a richer payload
 * with nested task data. This type intentionally models only the stable
 * review record subset.
 */
export interface TaskReviewDto {
  id: string;
  status: TaskReviewStatus;
  amount?: number | null;
  comment?: string | null;
  taskId: string;
  reviewerId?: string | null;
  reviewer?: ReviewEmployeeDto | null;
  createdAt: string;
}

export type UpdateReviewRequestDto =
  | {
      status: 'APPROVED';
      amount?: number;
      comment?: string;
    }
  | {
      status: 'REJECTED' | 'PENDING';
      amount?: never;
      comment?: string;
    };
