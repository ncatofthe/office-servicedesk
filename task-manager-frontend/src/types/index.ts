import type {
  AutomationRuleActionsDto,
  AutomationRuleChannel as SharedAutomationRuleChannel,
  AutomationRuleConditionsDto,
  AutomationRuleDto,
  AutomationRuleTestResultDto,
  AutomationRuleTriggerType as SharedAutomationRuleTriggerType,
  AutomationRunDto,
  AutomationRunStatus as SharedAutomationRunStatus,
  CommentVisibility as SharedCommentVisibility,
  CreateAutomationRuleRequestDto,
  AuthUserDto,
  AdminRegisterRequestDto,
  CreateTaskRequestDto,
  CurrentUserDto,
  DepartmentSummaryDto,
  GetMeResponseDto,
  LoginRequestDto,
  LoginResponseDto,
  ProductSettingsAdminDto,
  ProductSettingsDto,
  ProductFeatureKey as SharedProductFeatureKey,
  ProductFeaturesDto,
  RegisterRequestDto,
  RegisterResponseDto,
  ReviewListItemDto,
  SlaTimerStatus as SharedSlaTimerStatus,
  TeamUserDto,
  TaskTimelineEventDto,
  TaskTimelineEventType as SharedTaskTimelineEventType,
  TestAutomationRuleRequestDto,
  TaskAssigneeDto,
  TaskAttachmentDto,
  TaskCommentDto,
  TaskDetailDto,
  TaskSlaDto,
  TaskSlaPolicyDto,
  TaskPriority as SharedTaskPriority,
  TaskReviewDto,
  TaskReviewStatus as SharedTaskReviewStatus,
  TaskStatus as SharedTaskStatus,
  TaskSummaryDto,
  TasksListQueryDto,
  TasksListResponseDto,
  UpdateAutomationRuleRequestDto,
  UpdateUserProfileResponseDto,
  UpdateUserProfileRequestDto,
  UpdateUserRoleRequestDto,
  UpdateUserRoleResponseDto,
  UpdateUserAccessStatusRequestDto,
  UpdateUserAccessStatusResponseDto,
  UpdateReviewRequestDto,
  UpdateTaskRequestDto,
  UpdateTaskStatusRequestDto,
  UpdateProductSettingsRequest,
  UserProfileDto,
  UserRole as SharedUserRole,
} from '@task-manager/contracts';

// Shared transport enums
export type UserRole = SharedUserRole;
export type TaskStatus = SharedTaskStatus;
export type TaskPriority = SharedTaskPriority;
export type TaskReviewStatus = SharedTaskReviewStatus;
export type SlaTimerStatus = SharedSlaTimerStatus;
export type AutomationRuleTriggerType = SharedAutomationRuleTriggerType;
export type AutomationRuleChannel = SharedAutomationRuleChannel;
export type AutomationRunStatus = SharedAutomationRunStatus;
export type CommentVisibility = SharedCommentVisibility;
export type TaskTimelineEventType = SharedTaskTimelineEventType;
export type TransactionType = 'INCOME' | 'EXPENSE';
export type CannedReplyVisibility = 'PRIVATE' | 'SHARED';
export type CannedReplyApplyMode = 'COMMENT' | 'EMAIL_REPLY';
export type TaskEmailDirection = 'INBOUND' | 'OUTBOUND';
export type EmailOutboxStatus = 'DRY_RUN' | 'SENT' | 'FAILED' | 'RETRY_PENDING';

export type ProductSettings = ProductSettingsDto;
export type ProductSettingsAdmin = ProductSettingsAdminDto;
export type UpdateProductSettingsInput = UpdateProductSettingsRequest;
export type ProductFeatureKey = SharedProductFeatureKey;
export type ProductFeatures = ProductFeaturesDto;

// Legacy app-wide user model.
// Keep this wider shape for older UI flows and derived fields that are not
// part of the transport-level contracts yet.
export interface User {
  id: string;
  name: string;
  email: string;
  phone?: string;
  avatar?: string;
  role: UserRole;
  position?: string;
  department?: string;
  location?: string;
  skills?: string[];
  doneTasks?: number;
  inProgressTasks?: number;
  totalHours?: number;
  createdAt: string;
  updatedAt: string;
}

// Auth/session transport aliases.
export type SessionUser = AuthUserDto &
  Partial<Pick<CurrentUserDto, 'skills' | 'createdAt' | 'updatedAt'>>;
export interface DepartmentSummary extends Omit<DepartmentSummaryDto, 'id' | 'isActive'> {
  id: string;
  isActive: boolean;
}
export interface ManagedDepartment extends DepartmentSummary {
  headUser?: {
    id: string;
    name: string;
  } | null;
  membershipCount: number;
  taskCount: number;
  legacyUserCount: number;
  members?: Array<Pick<TeamUser, 'id' | 'name' | 'email' | 'role' | 'isActive'> & { isPrimary?: boolean }>;
  canDelete: boolean;
}
export interface CreateDepartmentInput {
  name: string;
}
export interface UpdateDepartmentInput {
  name?: string;
  isActive?: boolean;
}
export interface DeleteDepartmentResponse {
  message: string;
}

export type UserCapability =
  | 'tickets:read'
  | 'tickets:create'
  | 'tickets:update'
  | 'tickets:assign'
  | 'tickets:comment'
  | 'tickets:delete'
  | 'directories:read'
  | 'directories:manage'
  | 'knowledge:read'
  | 'knowledge:manage'
  | 'users:read'
  | 'users:manage'
  | 'reports:read';

export interface CapabilityAwareUser {
  role?: UserRole;
  capabilities?: UserCapability[];
}

export type ChatKind = 'DIRECT' | 'GROUP' | 'DEPARTMENT';

export interface ChatSettings {
  id: string;
  chatsEnabled: boolean;
  directChatsEnabled: boolean;
  departmentChatsEnabled: boolean;
  ticketChatsEnabled: boolean;
  attachmentsEnabled: boolean;
  maxAttachmentSizeMb: number;
  createdAt: string;
  updatedAt: string;
}

export interface ChatUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  position?: string | null;
  isActive: boolean;
}

export interface ChatMember {
  userId: string;
  user: ChatUser;
  lastReadAt?: string | null;
  joinedAt?: string;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  authorId: string;
  author: ChatUser;
  content: string;
  attachments: ChatAttachment[];
  editedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ChatAttachment {
  id: string;
  messageId: string;
  filename: string;
  path: string;
  mimeType?: string | null;
  sizeBytes?: number | null;
  createdAt: string;
}

export interface TicketChatMember {
  userId: string;
  user: ChatUser;
  role: 'AUTHOR' | 'ASSIGNEE' | 'PARTICIPANT';
  createdAt?: string;
}

export interface ChatThread {
  id: string;
  kind: ChatKind;
  title?: string | null;
  department?: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
  members: ChatMember[];
  lastMessage?: ChatMessage | null;
  unreadCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminChatThread {
  id: string;
  kind: ChatKind;
  title: string;
  department?: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;
  members: Array<Pick<ChatMember, 'userId' | 'user'>>;
  memberCount: number;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ServiceDeskDictionaryItem {
  id: string;
  name: string;
  description?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface ServiceDeskFolder extends ServiceDeskDictionaryItem {
  assigneeIds?: string[];
  assignees?: TeamUser[];
  membershipCount?: number;
  taskCount?: number;
  canDelete?: boolean;
  counts?: {
    tasks?: number;
    types?: number;
    subtypes?: number;
    teams?: number;
    teamAccesses?: number;
    slaPolicies?: number;
    productSettings?: number;
    automationRules?: number;
  };
}

export interface ServiceDeskTicketType extends ServiceDeskDictionaryItem {
  code?: string | null;
  folderId?: string | null;
  entityId?: string | null;
  slaId?: string | null;
  counts?: {
    tasks?: number;
    subtypes?: number;
    slaPolicies?: number;
    automationRules?: number;
  };
}

export interface ServiceDeskTicketSubtype extends ServiceDeskDictionaryItem {
  code?: string | null;
  typeId?: string | null;
  folderId?: string | null;
  counts?: {
    tasks?: number;
    slaPolicies?: number;
    automationRules?: number;
  };
}

export interface ServiceDeskEntity extends ServiceDeskDictionaryItem {
  code?: string | null;
  counts?: {
    tasks?: number;
    types?: number;
    automationRules?: number;
  };
}

export interface ServiceDeskTeam extends ServiceDeskDictionaryItem {
  folderId?: string | null;
  folderIds?: string[];
  folders?: ServiceDeskFolder[];
  members?: ServiceDeskTeamMember[];
  userIds?: string[];
  users?: TeamUser[];
  counts?: {
    members?: number;
    folders?: number;
  };
}

export interface ServiceDeskTeamMember {
  id: string;
  teamId: string;
  userId: string;
  role?: string | null;
  isLead: boolean;
  user?: TeamUser;
  createdAt?: string;
  updatedAt?: string;
}

export interface ServiceDeskTeamMemberInput {
  userId: string;
  role?: string | null;
  isLead?: boolean;
}

export interface ServiceDeskTeamMemberUpdateInput {
  role?: string | null;
  isLead?: boolean;
}

export interface ServiceDeskDictionaryInput {
  name: string;
  description?: string | null;
  isActive?: boolean;
  folderId?: string | null;
  folderIds?: string[];
  typeId?: string | null;
  entityId?: string | null;
  code?: string | null;
  userIds?: string[];
  assigneeIds?: string[];
}

export type AutomationRuleConditions = AutomationRuleConditionsDto;
export type AutomationRuleActions = AutomationRuleActionsDto;
export type AutomationRule = AutomationRuleDto;
export type AutomationRun = AutomationRunDto;
export type AutomationRuleTestResult = AutomationRuleTestResultDto;
export type CreateAutomationRuleInput = CreateAutomationRuleRequestDto;
export type UpdateAutomationRuleInput = UpdateAutomationRuleRequestDto;
export type TestAutomationRuleInput = TestAutomationRuleRequestDto;
export type TaskSlaPolicy = TaskSlaPolicyDto;
export type TaskSla = TaskSlaDto;

export interface SlaPolicy extends TaskSlaPolicyDto {
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateSlaPolicyInput {
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
}

export interface UpdateSlaPolicyInput {
  name?: string;
  description?: string | null;
  isActive?: boolean;
  sortOrder?: number;
  folderId?: string | null;
  typeId?: string | null;
  subtypeId?: string | null;
  priority?: TaskPriority | null;
  firstResponseMinutes?: number | null;
  resolutionMinutes?: number | null;
}

export interface TestSlaPolicyInput {
  taskId: string;
}

export interface SlaPolicyTestResult {
  matched: boolean;
  policy: SlaPolicy | null;
  resultingDueDates: {
    firstResponseDueAt?: string | null;
    resolutionDueAt?: string | null;
  };
  resultingStatuses: {
    firstResponseStatus: SlaTimerStatus | null;
    resolutionStatus: SlaTimerStatus | null;
  };
}

export interface KnowledgeArticle {
  id: string;
  title: string;
  slug: string;
  body: string;
  category?: string | null;
  isPublished: boolean;
  createdById?: string | null;
  updatedById?: string | null;
  createdBy?: Pick<TeamUser, 'id' | 'name' | 'email' | 'role'> | null;
  updatedBy?: Pick<TeamUser, 'id' | 'name' | 'email' | 'role'> | null;
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeArticleInput {
  title: string;
  body: string;
  category?: string | null;
  isPublished?: boolean;
}

export interface KnowledgeArticleQuery {
  search?: string;
  category?: string;
  isPublished?: boolean;
}

export type LoginRequest = LoginRequestDto;
export type RegisterRequest = RegisterRequestDto;
export type AdminRegisterRequest = AdminRegisterRequestDto;
export type LoginResponse = LoginResponseDto;
export type RegisterResponse = RegisterResponseDto;
export type GetMeResponse = GetMeResponseDto;
export interface AuthConfig {
  publicRegistrationEnabled: boolean;
}

// Users transport aliases.
export type UserProfile = UserProfileDto;
export type TeamUser = TeamUserDto;
export type ManagedUser = UpdateUserRoleResponseDto['user'];
export type UpdateUserProfileResponse = UpdateUserProfileResponseDto;
export type UpdateUserRoleResponse = UpdateUserRoleResponseDto;
export type UpdateUserAccessStatusRequest = UpdateUserAccessStatusRequestDto;
export type UpdateUserAccessStatusResponse = UpdateUserAccessStatusResponseDto;
export interface UpdateUserPasswordRequest {
  password: string;
}
export interface UpdateUserPasswordResponse {
  message: string;
}

// Users mutation inputs.
export type UserProfileUpdateInput = UpdateUserProfileRequestDto;
export type UserRoleUpdateInput = UpdateUserRoleRequestDto['role'];

// Task
export type TaskAssignee = TaskAssigneeDto;
export type TaskComment = TaskCommentDto;
export type TaskAttachment = TaskAttachmentDto;
export type TaskReview = TaskReviewDto;
export type TaskTimelineEvent = TaskTimelineEventDto;

export interface CreateTaskCommentInput {
  content: string;
  visibility?: CommentVisibility;
}

export interface CannedReply {
  id: string;
  title: string;
  body: string;
  category: string | null;
  isActive: boolean;
  visibility: CannedReplyVisibility;
  authorId: string;
  author?: Pick<TeamUser, 'id' | 'name' | 'email' | 'role'> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CannedReplyQuery {
  search?: string;
  category?: string;
  visibility?: CannedReplyVisibility;
  authorId?: string;
  isActive?: boolean;
}

export interface CannedReplyInput {
  title: string;
  body: string;
  category?: string | null;
  isActive?: boolean;
  visibility?: CannedReplyVisibility;
}

export interface ApplyCannedReplyRequest {
  templateId: string;
  mode: CannedReplyApplyMode;
  bodyOverride?: string;
}

export interface ApplyCannedReplyResponse {
  taskId: string;
  templateId: string;
  mode: CannedReplyApplyMode;
  bodyUsed: string;
  commentId?: string | null;
  dryRun?: boolean;
  recipient?: string | null;
  subject?: string | null;
}

export interface TaskEmailThreadItem {
  id: string;
  direction: TaskEmailDirection;
  messageId?: string | null;
  subject?: string | null;
  fromEmail?: string | null;
  fromName?: string | null;
  toEmail?: string | null;
  textPreview?: string | null;
  status?: EmailOutboxStatus | 'RECEIVED' | null;
  dryRun?: boolean;
  inReplyTo?: string | null;
  references?: string | null;
  commentId?: string | null;
  attempts?: number | null;
  errorMessage?: string | null;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  createdAt: string;
  updatedAt?: string | null;
  receivedAt?: string | null;
}

export interface TaskEmailThread {
  taskId: string;
  messages: TaskEmailThreadItem[];
}

export interface EmailOutboxItem {
  id: string;
  taskId: string;
  commentId?: string | null;
  recipientEmail: string;
  recipientName?: string | null;
  fromEmail: string;
  subject: string;
  textPreview?: string | null;
  status: EmailOutboxStatus;
  dryRun: boolean;
  messageId?: string | null;
  providerMessageId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
  errorMessage?: string | null;
  attempts: number;
  lastAttemptAt?: string | null;
  nextRetryAt?: string | null;
  createdById?: string | null;
  createdBy?: Pick<TeamUser, 'id' | 'name' | 'email' | 'role'> | null;
  task?: {
    id: string;
    ticketNumber?: number | null;
    title: string;
  } | null;
  comment?: {
    id: string;
    visibility: CommentVisibility;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface EmailOutboxQuery {
  status?: EmailOutboxStatus;
  taskId?: string;
  limit?: number;
}

export interface EmailOutboxRetryResponse {
  id: string;
  status: EmailOutboxStatus;
  skipped?: boolean;
  reason?: string;
}

export interface EmailOutboxHealth {
  outboundEnabled?: boolean | null;
  workerEnabled?: boolean | null;
  workerIntervalSeconds?: number | null;
  workerIntervalMinutes?: number | null;
  batchSize?: number | null;
  maxAttempts?: number | null;
  retryableCount?: number | null;
  lockedCount?: number | null;
  oldestPendingAt?: string | null;
  oldestFailedAt?: string | null;
  maskedSmtpHost?: string | null;
  maskedSmtpUser?: string | null;
  maskedFromEmail?: string | null;
}

export interface EmailSettingsAdmin {
  id: string; intakeEnabled: boolean; imapHost: string; imapPort: number; imapSecure: boolean; imapUser?: string | null;
  imapPasswordConfigured: boolean; mailbox: string; intakeStartUid: number; intakeMaxMessages: number; intakePollIntervalMs: number;
  attachmentMaxBytes: number; defaultFolderId?: string | null; defaultEntityId?: string | null; defaultTypeId?: string | null; defaultSubtypeId?: string | null;
  outboundEnabled: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser?: string | null; smtpPasswordConfigured: boolean;
  fromAddress?: string | null; fromName: string; workerEnabled: boolean; workerIntervalMs: number; workerBatchSize: number; lockTtlMs: number;
  maxAttempts: number; retryDelayMinutes: number; notificationsEnabled: boolean; notifyRequesterCreated: boolean; notifyRequesterComment: boolean;
  notifyRequesterStatus: boolean; notifyRequesterAssigned: boolean; notifyAssigneeAssigned: boolean; portalBaseUrl?: string | null;
  createdSubjectTemplate: string; createdBodyTemplate: string; commentSubjectTemplate: string; commentBodyTemplate: string;
  statusSubjectTemplate: string; statusBodyTemplate: string; assignedSubjectTemplate: string; assignedBodyTemplate: string;
  assigneeSubjectTemplate: string; assigneeBodyTemplate: string;
}

export type UpdateEmailSettingsInput = Partial<EmailSettingsAdmin> & { imapPassword?: string; smtpPassword?: string; clearImapPassword?: boolean; clearSmtpPassword?: boolean };
export interface EmailConnectionTest { imap?: { ok: boolean; message: string }; smtp?: { ok: boolean; message: string } }

export type TaskMergeMode = 'LINK' | 'UNION';

export interface TaskMergeReference {
  id: string;
  ticketNumber?: number;
  displayNumber?: string;
  title: string;
  status?: string;
  priority?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TaskMergeRecord {
  id: string;
  masterTaskId: string;
  childTaskId: string;
  mergeMode: TaskMergeMode;
  mergedBy?: string;
  mergedAt?: string;
  reason?: string | null;
  masterTask?: TaskMergeReference | null;
  childTask?: TaskMergeReference | null;
  mergedByUser?: Pick<TeamUser, 'id' | 'name' | 'role'> | null;
}

export interface TaskCloseConfirmation {
  userId: string;
  user?: Pick<TeamUser, 'id' | 'name' | 'role'> | null;
  confirmed: boolean;
  confirmedAt?: string | null;
}

export interface TaskCloseApprovalState {
  required: boolean;
  assigneeIds?: string[];
  approvedAssigneeIds?: string[];
  pendingAssigneeIds?: string[];
  approvals?: Array<{
    id?: string;
    taskId?: string;
    userId: string;
    approvedAt?: string | null;
    user?: Pick<TeamUser, 'id' | 'name' | 'role'> | null;
  }>;
}

export interface TaskClosureState {
  required: boolean;
  isComplete?: boolean;
  confirmations: TaskCloseConfirmation[];
}

export interface TaskMergeInfo {
  mode?: TaskMergeMode | null;
  masterTaskId?: string | null;
  masterTask?: TaskMergeReference | null;
  childTasks?: TaskMergeReference[];
  linkedTasks?: Array<TaskMergeReference | TaskMergeRecord>;
  mergedTasks?: TaskMergeRecord[];
  parentLinks?: TaskMergeRecord[];
  unionTasks?: TaskMergeReference[];
  relatedTasks?: TaskMergeReference[];
  closeApproval?: TaskCloseApprovalState | null;
  closure?: TaskClosureState | null;
  closeConfirmation?: TaskClosureState | null;
  closeConfirmations?: TaskCloseConfirmation[];
  requiresCloseConfirmation?: boolean;
}

export interface MergeTasksRequest {
  childTaskIds: string[];
  mergeMode: TaskMergeMode;
  reason: string;
}

export interface MergeTasksResponse {
  task?: TaskDetail | TaskSummary;
  mergeInfo?: TaskMergeInfo;
  message?: string;
}

export interface ConfirmTaskCloseResponse {
  task?: TaskDetail | TaskSummary;
  mergeInfo?: TaskMergeInfo;
  closure?: TaskClosureState;
  closed?: boolean;
  message?: string;
}

export type ServiceDeskTaskFields = {
  folderId?: string | null;
  typeId?: string | null;
  subtypeId?: string | null;
  entityId?: string | null;
  channel?: 'WEB' | 'EMAIL' | string | null;
  sourceChannel?: 'WEB' | 'EMAIL' | string | null;
  externalId?: string | null;
  externalNumber?: string | null;
  folder?: ServiceDeskFolder | null;
  type?: ServiceDeskTicketType | null;
  subtype?: ServiceDeskTicketSubtype | null;
  entity?: ServiceDeskEntity | null;
  mergeMode?: TaskMergeMode | null;
  mergeInfo?: TaskMergeInfo | null;
  closure?: TaskClosureState | null;
  closeConfirmation?: TaskClosureState | null;
  closeConfirmations?: TaskCloseConfirmation[];
  requiresCloseConfirmation?: boolean;
  requesterCloseRequired?: boolean;
  requesterCloseApprovedAt?: string | null;
  requesterCloseApprovedById?: string | null;
  masterTaskId?: string | null;
  masterTask?: TaskMergeReference | null;
  childTasks?: TaskMergeReference[];
  relatedTasks?: TaskMergeReference[];
};

export type TaskSummary = Omit<TaskSummaryDto, 'author' | 'assignees'> & ServiceDeskTaskFields & {
  author: NonNullable<TaskSummaryDto['author']>;
  assignees: NonNullable<TaskSummaryDto['assignees']>;
};

export type TaskDetail = Omit<TaskDetailDto, 'author' | 'assignees'> & ServiceDeskTaskFields & {
  author: NonNullable<TaskDetailDto['author']>;
  assignees: NonNullable<TaskDetailDto['assignees']>;
};

export type Task = TaskDetail;

export interface TaskHistory {
  id: string;
  taskId: string;
  userId: string;
  user: User;
  field: string;
  oldValue?: unknown;
  newValue?: unknown;
  createdAt: string;
}

// Shared transport requests
export type CreateTaskRequest = Omit<CreateTaskRequestDto, 'departmentId'> & {
  folderId?: string | null;
  typeId?: string | null;
  subtypeId?: string | null;
  entityId?: string | null;
};
export type UpdateTaskRequest = Omit<UpdateTaskRequestDto, 'departmentId'> & {
  folderId?: string | null;
  typeId?: string | null;
  subtypeId?: string | null;
  entityId?: string | null;
};
export type UpdateTaskStatusRequest = UpdateTaskStatusRequestDto;
export type UpdateReviewRequest = UpdateReviewRequestDto;

// Tasks response with pagination
export type TasksResponse = Omit<TasksListResponseDto, 'tasks'> & {
  tasks: TaskSummary[];
};
export type TasksQuery = TasksListQueryDto;

// Notification
export interface Notification {
  id: string;
  userId: string;
  type: string;
  message: string;
  isRead: boolean;
  title?: string | null;
  description?: string | null;
  safeReason?: string | null;
  taskId?: string;
  task?: {
    id: string;
    title: string;
    displayNumber?: string | null;
  };
  metadata?: Record<string, unknown> | null;
  createdAt: string;
}

export interface NotificationsListResponse {
  items: Notification[];
  nextCursor?: string | null;
}

export type FreshdeskImportStatus = 'DRY_RUN' | 'SUCCESS' | 'PARTIAL' | 'FAILED';

export interface FreshdeskImportSummary {
  total?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  errors?: number;
  comments?: number;
  attachments?: number;
  users?: number;
  commentsCreated?: number;
  attachmentsCreated?: number;
  usersCreated?: number;
  commentsPlanned?: number;
  commentsImported?: number;
  commentsSkipped?: number;
  attachmentsPlanned?: number;
  attachmentsImported?: number;
  attachmentsSkipped?: number;
  attachmentsFailed?: number;
}

export interface FreshdeskImportError {
  row?: number;
  ticketId?: string | number;
  externalId?: string | number;
  message?: string;
}

export interface FreshdeskImportRun {
  id: string;
  source: string;
  status: FreshdeskImportStatus | string;
  dryRun: boolean;
  fileName?: string | null;
  summary?: FreshdeskImportSummary | null;
  errors?: FreshdeskImportError[] | Record<string, unknown>[] | null;
  createdById?: string | null;
  createdBy?: {
    id: string;
    name: string;
    email: string;
    role: UserRole;
  } | null;
  createdAt: string;
  updatedAt?: string | null;
  finishedAt?: string | null;
}

export interface FreshdeskImportPayload {
  tickets: Record<string, unknown>[];
  fileName?: string;
}

export interface FreshdeskImportResult {
  run: FreshdeskImportRun;
  summary: FreshdeskImportSummary;
  errors: FreshdeskImportError[];
}

export interface FreshdeskSourceHealth {
  configured: boolean;
  domain?: string | null;
  downloadAttachmentsEnabled: boolean;
}

export interface FreshdeskPullDryRunPayload {
  updatedSince?: string;
  maxTickets?: number;
  downloadAttachments?: boolean;
}

export type FreshdeskPullPayload = FreshdeskPullDryRunPayload;

// Finance
export interface Account {
  id: string;
  userId: string;
  user: User;
  type: string;
  balance: number;
  transactions?: Transaction[];
}

export interface Transaction {
  id: string;
  accountId: string;
  account: Account;
  amount: number;
  type: TransactionType;
  category?: string;
  taskId?: string;
  task?: Task;
  description?: string;
  createdAt: string;
}

export interface CreateTransactionRequest {
  amount: number;
  type: TransactionType;
  category?: string;
  accountId: string;
  date?: string;
  description?: string;
  taskId?: string;
}

// Dashboard
export interface DashboardData {
  kpi: {
    pending: number;
    inProgress: number;
    completed: number;
    completionRate: string;
  };
  monthlyProductivity: {
    month: string;
    completed: number;
  }[];
  efficiency: {
    onTimePercent: string;
    onTimeCount: number;
    totalDone: number;
  };
  activeEmployees: {
    id: string;
    name: string;
    role: UserRole;
    tasks_count: number;
  }[];
  workerOfMonth: {
    id: string;
    name: string;
    role: UserRole;
    done_count: number;
  } | null;
  recentClosures?: Array<{
    id: string;
    closedAt: string;
    actor: {
      id: string;
      name: string;
      role: UserRole;
    } | null;
    task: {
      id: string;
      ticketNumber?: number;
      displayNumber?: string;
      title: string;
      priority: TaskPriority;
      status: TaskStatus;
    };
  }>;
}

// Reports
export interface ReportsData {
  completionRatings: {
    id: string;
    name: string;
    role: UserRole;
    department: string | null;
    done: number;
    total: number;
    completionPercent: number;
  }[];
  overdue: {
    id: string;
    name: string;
    overdue_count: number;
  }[];
  economicEfficiency: number;
  activity: {
    month: string;
    comments: number;
  }[];
  onTimePercent: number;
  costsByRole: {
    role: string;
    expense_sum: number;
  }[];
  costsByDepartment: {
    department: string;
    expense_sum: number;
  }[];
}

// Review
export type ReviewItem = ReviewListItemDto;

// API Error
export interface ApiError {
  error: string;
  message?: string;
}
