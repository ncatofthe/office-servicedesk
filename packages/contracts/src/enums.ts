export const USER_ROLES = [
  'ADMIN',
  'AGENT',
  'REQUESTER',
  'VIEWER',
] as const;

export type UserRole = (typeof USER_ROLES)[number];

export const PRODUCT_USER_ROLES = ['ADMIN', 'AGENT', 'REQUESTER', 'VIEWER'] as const;

export type ProductUserRole = (typeof PRODUCT_USER_ROLES)[number];

export const TASK_STATUSES = [
  'NEW',
  'IN_PROGRESS',
  'REVIEW',
  'DONE',
  'POSTPONED',
  'REWORK',
  'MERGED',
] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;

export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const SLA_TIMER_STATUSES = ['PENDING', 'MET', 'BREACHED'] as const;

export type SlaTimerStatus = (typeof SLA_TIMER_STATUSES)[number];

export const COMMENT_VISIBILITIES = ['PUBLIC', 'INTERNAL'] as const;

export type CommentVisibility = (typeof COMMENT_VISIBILITIES)[number];

export const CANNED_REPLY_VISIBILITIES = ['PRIVATE', 'SHARED'] as const;

export type CannedReplyVisibility = (typeof CANNED_REPLY_VISIBILITIES)[number];

export const CANNED_REPLY_APPLY_MODES = ['COMMENT', 'EMAIL_REPLY'] as const;

export type CannedReplyApplyMode = (typeof CANNED_REPLY_APPLY_MODES)[number];

export const TASK_TIMELINE_EVENT_TYPES = [
  'TASK_CREATED',
  'TASK_UPDATED',
  'STATUS_CHANGED',
  'ASSIGNEE_ADDED',
  'ASSIGNEE_REMOVED',
  'COMMENT_ADDED',
  'INTERNAL_NOTE_ADDED',
  'FILE_ATTACHED',
  'FILE_DELETED',
  'TASK_MERGED',
  'CLOSE_APPROVED',
  'CANNED_REPLY_USED',
  'EMAIL_REPLY_SENT',
  'SLA_POLICY_APPLIED',
  'AUTOMATION_APPLIED',
] as const;

export type TaskTimelineEventType = (typeof TASK_TIMELINE_EVENT_TYPES)[number];

export const AUTOMATION_RULE_TRIGGER_TYPES = [
  'TASK_CREATED',
  'EMAIL_TICKET_CREATED',
] as const;

export type AutomationRuleTriggerType =
  (typeof AUTOMATION_RULE_TRIGGER_TYPES)[number];

export const AUTOMATION_RULE_CHANNELS = ['WEB', 'EMAIL'] as const;

export type AutomationRuleChannel = (typeof AUTOMATION_RULE_CHANNELS)[number];

export const AUTOMATION_RUN_STATUSES = ['SUCCESS', 'ERROR'] as const;

export type AutomationRunStatus = (typeof AUTOMATION_RUN_STATUSES)[number];

export const TASK_REVIEW_STATUSES = ['PENDING', 'APPROVED', 'REJECTED'] as const;

export type TaskReviewStatus = (typeof TASK_REVIEW_STATUSES)[number];

export const NOTIFICATION_KINDS = [
  'TASK_CREATED_WEB',
  'TASK_CREATED_EMAIL',
  'REQUESTER_COMMENT',
  'AGENT_PUBLIC_COMMENT',
  'AGENT_INTERNAL_NOTE',
  'TASK_ASSIGNED',
  'TASK_STATUS_CHANGED',
  'TASK_MERGED',
  'EMAIL_OUTBOUND_FAILED',
  'EMAIL_OUTBOUND_RECOVERED',
] as const;

export type NotificationKind = (typeof NOTIFICATION_KINDS)[number];

export const IMPORT_RUN_STATUSES = ['DRY_RUN', 'SUCCESS', 'PARTIAL', 'FAILED'] as const;

export type ImportRunStatus = (typeof IMPORT_RUN_STATUSES)[number];

export const EXTERNAL_SYSTEMS = ['FRESHDESK', 'ONE_C'] as const;

export type ExternalSystem = (typeof EXTERNAL_SYSTEMS)[number];
