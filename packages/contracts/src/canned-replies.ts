import type { CannedReplyApplyMode, CannedReplyVisibility, UserRole } from './enums.js';

export interface CannedReplyAuthorDto {
  id: string;
  name: string;
  email?: string;
  role?: UserRole;
}

export interface CannedReplyDto {
  id: string;
  title: string;
  body: string;
  category: string | null;
  isActive: boolean;
  visibility: CannedReplyVisibility;
  authorId: string;
  author?: CannedReplyAuthorDto;
  createdAt: string;
  updatedAt: string;
}

export interface CannedReplyApplyResultDto {
  taskId: string;
  templateId: string;
  mode: CannedReplyApplyMode;
  bodyUsed: string;
  commentId?: string | null;
  dryRun?: boolean;
  recipient?: string | null;
  subject?: string | null;
}
