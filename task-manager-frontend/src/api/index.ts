import api from './client';
import type {
  AutomationRule,
  AutomationRun,
  AutomationRuleTestResult,
  CreateAutomationRuleInput,
  CreateSlaPolicyInput,
  CreateDepartmentInput,
  DeleteDepartmentResponse,
  DepartmentSummary,
  ServiceDeskDictionaryInput,
  ServiceDeskEntity,
  ServiceDeskFolder,
  ServiceDeskTeamMember,
  ServiceDeskTeamMemberInput,
  ServiceDeskTeamMemberUpdateInput,
  ServiceDeskTeam,
  ServiceDeskTicketSubtype,
  ServiceDeskTicketType,
  TestAutomationRuleInput,
  KnowledgeArticle,
  KnowledgeArticleInput,
  KnowledgeArticleQuery,
  ManagedDepartment,
  TeamUser,
  UserProfile,
  UserProfileUpdateInput,
  UserRoleUpdateInput,
  UpdateDepartmentInput,
  UpdateUserProfileResponse,
  UpdateUserRoleResponse,
  UpdateUserAccessStatusResponse,
  UpdateUserPasswordRequest,
  UpdateUserPasswordResponse,
  LoginRequest,
  RegisterRequest,
  AdminRegisterRequest,
  LoginResponse,
  RegisterResponse,
  AuthConfig,
  SlaPolicy,
  SlaPolicyTestResult,
  GetMeResponse,
  TaskSummary,
  TaskTimelineEvent,
  TaskEmailThread,
  TaskDetail,
  TasksResponse,
  TasksQuery,
  CreateTaskRequest,
  ConfirmTaskCloseResponse,
  ApplyCannedReplyRequest,
  ApplyCannedReplyResponse,
  EmailOutboxItem,
  EmailOutboxHealth,
  EmailOutboxQuery,
  EmailOutboxRetryResponse,
  EmailSettingsAdmin,
  UpdateEmailSettingsInput,
  EmailConnectionTest,
  FreshdeskImportPayload,
  FreshdeskImportResult,
  FreshdeskImportRun,
  FreshdeskPullDryRunPayload,
  FreshdeskPullPayload,
  FreshdeskSourceHealth,
  CreateTaskCommentInput,
  CannedReply,
  CannedReplyInput,
  CannedReplyQuery,
  MergeTasksRequest,
  TaskMergeInfo,
  UpdateTaskRequest,
  UpdateTaskStatusRequest,
  UpdateAutomationRuleInput,
  UpdateSlaPolicyInput,
  TaskComment,
  TaskAttachment,
  TestSlaPolicyInput,
  Notification,
  NotificationsListResponse,
  DashboardData,
  ReportsData,
  ProductSettings,
  ProductSettingsAdmin,
  UpdateProductSettingsInput,
  ChatThread,
  ChatMessage,
  ChatUser,
  AdminChatThread,
  ChatSettings,
  TicketChatMember,
} from '../types';

// Auth API
export const authApi = {
  getConfig: () =>
    api.get<AuthConfig>('/auth/config').then(r => r.data),
  login: (data: LoginRequest) =>
    api.post<LoginResponse>('/auth/login', data).then(r => r.data),
  register: (data: RegisterRequest) =>
    api.post<RegisterResponse>('/auth/register', data).then(r => r.data),
  registerAdmin: (data: AdminRegisterRequest) =>
    api.post<RegisterResponse>('/auth/register/admin', data).then(r => r.data),
  getMe: () =>
    api.get<GetMeResponse>('/auth/me').then(r => r.data),
  logout: (token: string) =>
    api.post('/auth/logout', undefined, {
      headers: { Authorization: `Bearer ${token}` },
    }).then(r => r.data),
};

// Users API
export const usersApi = {
  getAll: (params?: { role?: string; search?: string }) =>
    api.get<TeamUser[]>('/users', { params }).then(r => r.data),
  getById: (id: string) =>
    api.get<UserProfile>(`/users/${id}`).then(r => r.data),
  updateProfile: (id: string, data: UserProfileUpdateInput) =>
    api.put<UpdateUserProfileResponse>(`/users/${id}`, data).then(r => r.data),
  updateRole: (id: string, role: UserRoleUpdateInput) =>
    api.patch<UpdateUserRoleResponse>(`/users/${id}/role`, { role }).then(r => r.data),
  updateStatus: (id: string, isActive: boolean) =>
    api.patch<UpdateUserAccessStatusResponse>(`/users/${id}/status`, { isActive }).then(r => r.data),
  updatePassword: (id: string, data: UpdateUserPasswordRequest) =>
    api.patch<UpdateUserPasswordResponse>(`/users/${id}/password`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/users/${id}`).then(r => r.data),
  archive: (id: string) =>
    api.delete(`/users/${id}`, { params: { mode: 'archive' } }).then(r => r.data),
};

// Departments API
export const departmentsApi = {
  getAll: () =>
    api.get<DepartmentSummary[]>('/departments').then(r => r.data),
  getManaged: () =>
    api.get<ManagedDepartment[]>('/departments/admin').then(r => r.data),
  create: (data: CreateDepartmentInput) =>
    api.post<ManagedDepartment>('/departments', data).then(r => r.data),
  update: (id: string, data: UpdateDepartmentInput) =>
    api.patch<ManagedDepartment>(`/departments/${id}`, data).then(r => r.data),
  deleteManaged: (id: string, options?: { detach?: boolean }) =>
    api.delete<DeleteDepartmentResponse>(`/departments/${id}`, {
      params: options?.detach ? { mode: 'detach' } : undefined,
    }).then(r => r.data),
};

const getResponseStatus = (error: unknown) =>
  (error as { response?: { status?: number } })?.response?.status;

const isPublicDictionaryMissing = (error: unknown) => {
  const status = getResponseStatus(error);
  return status === 404 || status === 405 || status === 501;
};

const getReadableServiceDeskDictionary = async <T>(
  publicPath: string,
  adminReader: () => Promise<T[]>,
  options?: { adminFallback?: boolean }
) => {
  try {
    return await api.get<T[]>(publicPath).then(r => r.data);
  } catch (error) {
    if (options?.adminFallback && isPublicDictionaryMissing(error)) {
      return adminReader();
    }

    throw error;
  }
};

// ServiceDesk dictionaries API.
// Read endpoints use /servicedesk/* first; ADMIN can fall back to /servicedesk/admin/* when public read routes are not exposed.
export const serviceDeskFoldersApi = {
  getAll: (options?: { adminFallback?: boolean }) =>
    getReadableServiceDeskDictionary<ServiceDeskFolder>('/servicedesk/folders', serviceDeskFoldersApi.getManaged, options),
  getManaged: () =>
    api.get<ServiceDeskFolder[]>('/servicedesk/admin/folders').then(r => r.data),
  create: (data: ServiceDeskDictionaryInput) =>
    api.post<ServiceDeskFolder>('/servicedesk/admin/folders', data).then(r => r.data),
  update: (id: string, data: ServiceDeskDictionaryInput) =>
    api.patch<ServiceDeskFolder>(`/servicedesk/admin/folders/${id}`, data).then(r => r.data),
  delete: (id: string, options?: { detach?: boolean }) =>
    api.delete(`/servicedesk/admin/folders/${id}`, {
      params: options?.detach ? { mode: 'detach' } : undefined,
    }).then(r => r.data),
};

export const productSettingsApi = {
  getPublic: () =>
    api.get<ProductSettings>('/servicedesk/product-settings').then(r => r.data),
  getManaged: () =>
    api.get<ProductSettingsAdmin>('/servicedesk/admin/product-settings').then(r => r.data),
  update: (data: UpdateProductSettingsInput) =>
    api.patch<ProductSettingsAdmin>('/servicedesk/admin/product-settings', data).then(r => r.data),
};

export const ticketTypesApi = {
  getAll: (options?: { adminFallback?: boolean }) =>
    getReadableServiceDeskDictionary<ServiceDeskTicketType>('/servicedesk/types', ticketTypesApi.getManaged, options),
  getManaged: () =>
    api.get<ServiceDeskTicketType[]>('/servicedesk/admin/types').then(r => r.data),
  create: (data: ServiceDeskDictionaryInput) =>
    api.post<ServiceDeskTicketType>('/servicedesk/admin/types', data).then(r => r.data),
  update: (id: string, data: ServiceDeskDictionaryInput) =>
    api.patch<ServiceDeskTicketType>(`/servicedesk/admin/types/${id}`, data).then(r => r.data),
  delete: (id: string, options?: { detach?: boolean }) =>
    api.delete(`/servicedesk/admin/types/${id}`, {
      params: options?.detach ? { mode: 'detach' } : undefined,
    }).then(r => r.data),
};

export const ticketSubtypesApi = {
  getAll: (options?: { adminFallback?: boolean }) =>
    getReadableServiceDeskDictionary<ServiceDeskTicketSubtype>('/servicedesk/subtypes', ticketSubtypesApi.getManaged, options),
  getManaged: () =>
    api.get<ServiceDeskTicketSubtype[]>('/servicedesk/admin/subtypes').then(r => r.data),
  create: (data: ServiceDeskDictionaryInput) =>
    api.post<ServiceDeskTicketSubtype>('/servicedesk/admin/subtypes', data).then(r => r.data),
  update: (id: string, data: ServiceDeskDictionaryInput) =>
    api.patch<ServiceDeskTicketSubtype>(`/servicedesk/admin/subtypes/${id}`, data).then(r => r.data),
  delete: (id: string, options?: { detach?: boolean }) =>
    api.delete(`/servicedesk/admin/subtypes/${id}`, {
      params: options?.detach ? { mode: 'detach' } : undefined,
    }).then(r => r.data),
};

export const ticketEntitiesApi = {
  getAll: (options?: { adminFallback?: boolean }) =>
    getReadableServiceDeskDictionary<ServiceDeskEntity>('/servicedesk/entities', ticketEntitiesApi.getManaged, options),
  getManaged: () =>
    api.get<ServiceDeskEntity[]>('/servicedesk/admin/entities').then(r => r.data),
  create: (data: ServiceDeskDictionaryInput) =>
    api.post<ServiceDeskEntity>('/servicedesk/admin/entities', data).then(r => r.data),
  update: (id: string, data: ServiceDeskDictionaryInput) =>
    api.patch<ServiceDeskEntity>(`/servicedesk/admin/entities/${id}`, data).then(r => r.data),
  delete: (id: string, options?: { detach?: boolean }) =>
    api.delete(`/servicedesk/admin/entities/${id}`, {
      params: options?.detach ? { mode: 'detach' } : undefined,
    }).then(r => r.data),
};

export const serviceDeskTeamsApi = {
  getAll: (options?: { adminFallback?: boolean }) =>
    getReadableServiceDeskDictionary<ServiceDeskTeam>('/servicedesk/teams', serviceDeskTeamsApi.getManaged, options),
  getManaged: () =>
    api.get<ServiceDeskTeam[]>('/servicedesk/admin/teams').then(r => r.data),
  create: (data: ServiceDeskDictionaryInput) =>
    api.post<ServiceDeskTeam>('/servicedesk/admin/teams', data).then(r => r.data),
  update: (id: string, data: Partial<ServiceDeskDictionaryInput>) =>
    api.patch<ServiceDeskTeam>(`/servicedesk/admin/teams/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/servicedesk/admin/teams/${id}`).then(r => r.data),
  getMembers: (teamId: string) =>
    api.get<ServiceDeskTeamMember[]>(`/servicedesk/admin/teams/${teamId}/members`).then(r => r.data),
  createMember: (teamId: string, data: ServiceDeskTeamMemberInput) =>
    api.post<ServiceDeskTeamMember>(`/servicedesk/admin/teams/${teamId}/members`, data).then(r => r.data),
  updateMember: (id: string, data: ServiceDeskTeamMemberUpdateInput) =>
    api.patch<ServiceDeskTeamMember>(`/servicedesk/admin/team-members/${id}`, data).then(r => r.data),
  deleteMember: (id: string) =>
    api.delete(`/servicedesk/admin/team-members/${id}`).then(r => r.data),
};

export const automationRulesApi = {
  getAll: () =>
    api.get<AutomationRule[]>('/servicedesk/admin/automation-rules').then(r => r.data),
  getById: (id: string) =>
    api.get<AutomationRule>(`/servicedesk/admin/automation-rules/${id}`).then(r => r.data),
  create: (data: CreateAutomationRuleInput) =>
    api.post<AutomationRule>('/servicedesk/admin/automation-rules', data).then(r => r.data),
  update: (id: string, data: UpdateAutomationRuleInput) =>
    api.put<AutomationRule>(`/servicedesk/admin/automation-rules/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete<{ message: string }>(`/servicedesk/admin/automation-rules/${id}`).then(r => r.data),
  test: (id: string, data: TestAutomationRuleInput) =>
    api.post<AutomationRuleTestResult>(`/servicedesk/admin/automation-rules/${id}/test`, data).then(r => r.data),
};

export const automationRunsApi = {
  getAll: (params?: { taskId?: string; ruleId?: string }) =>
    api.get<AutomationRun[]>('/servicedesk/admin/automation-runs', { params }).then(r => r.data),
};

export const emailOutboxAdminApi = {
  getAll: (params?: EmailOutboxQuery) =>
    api.get<EmailOutboxItem[]>('/servicedesk/admin/email-outbox', { params }).then(r => r.data),
  getHealth: () =>
    api.get<EmailOutboxHealth>('/servicedesk/admin/email-health').then(r => r.data),
  retry: (id: string) =>
    api.post<EmailOutboxRetryResponse>(`/servicedesk/admin/email-outbox/${id}/retry`).then(r => r.data),
};

export const emailSettingsAdminApi = {
  get: () => api.get<EmailSettingsAdmin>('/servicedesk/admin/email-settings').then(r => r.data),
  update: (data: UpdateEmailSettingsInput) => api.patch<EmailSettingsAdmin>('/servicedesk/admin/email-settings', data).then(r => r.data),
  test: (target: 'IMAP' | 'SMTP' | 'BOTH' = 'BOTH') => api.post<EmailConnectionTest>('/servicedesk/admin/email-settings/test', { target }).then(r => r.data),
};

export const freshdeskImportAdminApi = {
  getSourceHealth: () =>
    api.get<FreshdeskSourceHealth>('/servicedesk/admin/freshdesk-import/source-health').then(r => r.data),
  pullDryRun: (data: FreshdeskPullDryRunPayload) =>
    api.post<FreshdeskImportResult>('/servicedesk/admin/freshdesk-import/pull/dry-run', data).then(r => r.data),
  pull: (data: FreshdeskPullPayload) =>
    api.post<FreshdeskImportResult>('/servicedesk/admin/freshdesk-import/pull', data).then(r => r.data),
  dryRun: (data: FreshdeskImportPayload) =>
    api.post<FreshdeskImportResult>('/servicedesk/admin/freshdesk-import/dry-run', data).then(r => r.data),
  run: (data: FreshdeskImportPayload) =>
    api.post<FreshdeskImportResult>('/servicedesk/admin/freshdesk-import', data).then(r => r.data),
  getRuns: (params?: { limit?: number; cursor?: string }) =>
    api.get<FreshdeskImportRun[]>('/servicedesk/admin/freshdesk-import/runs', { params }).then(r => r.data),
  getRun: (id: string) =>
    api.get<FreshdeskImportRun>(`/servicedesk/admin/freshdesk-import/runs/${id}`).then(r => r.data),
};

export const slaPoliciesApi = {
  getAll: () =>
    api.get<SlaPolicy[]>('/servicedesk/admin/sla-policies').then(r => r.data),
  getById: (id: string) =>
    api.get<SlaPolicy>(`/servicedesk/admin/sla-policies/${id}`).then(r => r.data),
  create: (data: CreateSlaPolicyInput) =>
    api.post<SlaPolicy>('/servicedesk/admin/sla-policies', data).then(r => r.data),
  update: (id: string, data: UpdateSlaPolicyInput) =>
    api.put<SlaPolicy>(`/servicedesk/admin/sla-policies/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete<{ message: string }>(`/servicedesk/admin/sla-policies/${id}`).then(r => r.data),
  test: (id: string, data: TestSlaPolicyInput) =>
    api.post<SlaPolicyTestResult>(`/servicedesk/admin/sla-policies/${id}/test`, data).then(r => r.data),
};

// Knowledge base API
export const knowledgeApi = {
  getArticles: (params?: KnowledgeArticleQuery) =>
    api.get<KnowledgeArticle[]>('/knowledge/articles', { params }).then(r => r.data),
  getArticle: (id: string) =>
    api.get<KnowledgeArticle>(`/knowledge/articles/${id}`).then(r => r.data),
  createArticle: (data: KnowledgeArticleInput) =>
    api.post<KnowledgeArticle>('/knowledge/articles', data).then(r => r.data),
  updateArticle: (id: string, data: KnowledgeArticleInput) =>
    api.put<KnowledgeArticle>(`/knowledge/articles/${id}`, data).then(r => r.data),
  deleteArticle: (id: string) =>
    api.delete<{ success: boolean }>(`/knowledge/articles/${id}`).then(r => r.data),
};

export const cannedRepliesApi = {
  getAll: (params?: CannedReplyQuery) =>
    api.get<CannedReply[]>('/canned-replies', { params }).then(r => r.data),
  getById: (id: string) =>
    api.get<CannedReply>(`/canned-replies/${id}`).then(r => r.data),
  create: (data: CannedReplyInput) =>
    api.post<CannedReply>('/canned-replies', data).then(r => r.data),
  update: (id: string, data: Partial<CannedReplyInput>) =>
    api.put<CannedReply>(`/canned-replies/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete<{ message: string }>(`/canned-replies/${id}`).then(r => r.data),
};

// Tasks API
export const tasksApi = {
  getAll: (params?: TasksQuery) =>
    api.get<TasksResponse>('/tasks', { params }).then(r => r.data),
  getById: (id: string) =>
    api.get<TaskDetail>(`/tasks/${id}`).then(r => r.data),
  create: (data: CreateTaskRequest) =>
    api.post<TaskSummary>('/tasks', data).then(r => r.data),
  update: (id: string, data: UpdateTaskRequest) =>
    api.put<TaskSummary>(`/tasks/${id}`, data).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/tasks/${id}`).then(r => r.data),
  updateStatus: (id: string, status: UpdateTaskStatusRequest['status']) => {
    const payload: UpdateTaskStatusRequest = { status };
    return api.patch<TaskSummary>(`/tasks/${id}/status`, payload).then(r => r.data);
  },
  getMergeInfo: (id: string) =>
    api.get<TaskMergeInfo>(`/tasks/${id}/merge-info`).then(r => r.data),
  getTimeline: (id: string) =>
    api.get<TaskTimelineEvent[]>(`/tasks/${id}/timeline`).then(r => r.data),
  getEmailThread: (id: string) =>
    api.get<TaskEmailThread>(`/tasks/${id}/email-thread`).then(r => r.data),
  merge: (id: string, data: MergeTasksRequest) =>
    api.post<TaskMergeInfo>(`/tasks/${id}/merge`, data).then(r => ({ mergeInfo: r.data })),
  confirmClose: (id: string) =>
    api.post<ConfirmTaskCloseResponse>(`/tasks/${id}/close-approve`).then(r => r.data),
  confirmRequesterClose: (id: string) =>
    api.post<{ task?: TaskSummary; message?: string }>(`/tasks/${id}/requester-close-approve`).then(r => r.data),
  applyCannedReply: (id: string, data: ApplyCannedReplyRequest) =>
    api.post<ApplyCannedReplyResponse>(`/tasks/${id}/reply-from-template`, data).then(r => r.data),
  addAssignee: (taskId: string, userId: string) =>
    api.post(`/tasks/${taskId}/assignees`, { userId }).then(r => r.data),
  removeAssignee: (taskId: string, userId: string) =>
    api.delete(`/tasks/${taskId}/assignees/${userId}`).then(r => r.data),
};

// Comments API
export const commentsApi = {
  getByTask: (taskId: string) =>
    api.get<TaskComment[]>(`/comments/${taskId}`).then(r => r.data),
  create: (taskId: string, data: CreateTaskCommentInput) =>
    api.post<TaskComment>(`/comments/${taskId}`, data).then(r => r.data),
  update: (id: string, content: string) =>
    api.put<TaskComment>(`/comments/${id}`, { content }).then(r => r.data),
  delete: (id: string) =>
    api.delete(`/comments/${id}`).then(r => r.data),
};

// Internal chats API. Ticket conversations reuse commentsApi to keep one history.
export const chatsApi = {
  getSettings: () =>
    api.get<ChatSettings>('/chats/settings').then(r => r.data),
  updateSettings: (data: Partial<Pick<ChatSettings,
    'chatsEnabled'
    | 'directChatsEnabled'
    | 'departmentChatsEnabled'
    | 'ticketChatsEnabled'
    | 'attachmentsEnabled'
    | 'maxAttachmentSizeMb'
  >>) =>
    api.patch<ChatSettings>('/chats/admin/settings', data).then(r => r.data),
  getAll: () =>
    api.get<ChatThread[]>('/chats').then(r => r.data),
  getUsers: () =>
    api.get<ChatUser[]>('/chats/users').then(r => r.data),
  createDirect: (userId: string) =>
    api.post<ChatThread>('/chats/direct', { userId }).then(r => r.data),
  updateThread: (chatId: string, title: string) =>
    api.patch<ChatThread>(`/chats/${chatId}`, { title }).then(r => r.data),
  deleteThread: (chatId: string) =>
    api.delete<{ message: string }>(`/chats/${chatId}`).then(r => r.data),
  addMember: (chatId: string, userId: string) =>
    api.post<ChatThread>(`/chats/${chatId}/members`, { userId }).then(r => r.data),
  removeMember: (chatId: string, userId: string) =>
    api.delete(`/chats/${chatId}/members/${userId}`).then(r => r.data),
  getTicketMembers: (taskId: string) =>
    api.get<TicketChatMember[]>(`/chats/tickets/${taskId}/members`).then(r => r.data),
  addTicketMember: (taskId: string, userId: string) =>
    api.post<TicketChatMember[]>(`/chats/tickets/${taskId}/members`, { userId }).then(r => r.data),
  removeTicketMember: (taskId: string, userId: string) =>
    api.delete<TicketChatMember[]>(`/chats/tickets/${taskId}/members/${userId}`).then(r => r.data),
  getMessages: (chatId: string, params?: { limit?: number }) =>
    api.get<ChatMessage[]>(`/chats/${chatId}/messages`, { params }).then(r => r.data),
  sendMessage: (chatId: string, content: string) =>
    api.post<ChatMessage>(`/chats/${chatId}/messages`, { content }).then(r => r.data),
  sendAttachment: (chatId: string, file: File, content?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (content?.trim()) formData.append('content', content.trim());
    return api.post<ChatMessage>(`/chats/${chatId}/attachments`, formData).then(r => r.data);
  },
  downloadAttachment: async (attachmentId: string, fileName?: string) => {
    const response = await api.get(`/chats/attachments/${attachmentId}/download`, { responseType: 'blob' });
    const blobUrl = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName || `chat-file-${attachmentId}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  },
  getAttachmentBlob: (attachmentId: string) =>
    api.get<Blob>(`/chats/attachments/${attachmentId}/download`, { responseType: 'blob' }).then(r => r.data),
  updateMessage: (chatId: string, messageId: string, content: string) =>
    api.patch<ChatMessage>(`/chats/${chatId}/messages/${messageId}`, { content }).then(r => r.data),
  deleteMessage: (chatId: string, messageId: string) =>
    api.delete(`/chats/${chatId}/messages/${messageId}`).then(r => r.data),
  markRead: (chatId: string) =>
    api.post(`/chats/${chatId}/read`).then(r => r.data),
  getUnreadCount: () =>
    api.get<{ count: number }>('/chats/unread-count').then(r => r.data.count || 0),
  getAdmin: (params?: { search?: string; kind?: string }) =>
    api.get<AdminChatThread[]>('/chats/admin', { params }).then(r => r.data),
  clearAdmin: (chatId: string) =>
    api.delete(`/chats/admin/${chatId}/messages`).then(r => r.data),
  deleteAdmin: (chatId: string) =>
    api.delete(`/chats/admin/${chatId}`).then(r => r.data),
};

// Files API
export const filesApi = {
  uploadTaskFile: (taskId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post<TaskAttachment>(`/files/${taskId}`, formData).then(r => r.data);
  },
  getTaskFiles: (taskId: string) =>
    api.get<TaskAttachment[]>(`/files/${taskId}`).then(r => r.data),
  deleteTaskFile: (id: string) =>
    api.delete(`/files/${id}`).then(r => r.data),
  downloadTaskFile: async (id: string, fileName?: string) => {
    const response = await api.get(`/files/${id}/download`, { responseType: 'blob' });
    const blobUrl = window.URL.createObjectURL(response.data);
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = fileName || `file-${id}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(blobUrl);
  },
  getTaskFileBlob: (id: string) =>
    api.get<Blob>(`/files/${id}/download`, { responseType: 'blob' }).then(r => r.data),
};

// Notifications API
export const notificationsApi = {
  getAll: (params?: { limit?: number; cursor?: string; unreadOnly?: boolean }) =>
    api.get<Notification[] | Partial<NotificationsListResponse>>('/notifications', { params }).then((response) => {
      const payload = response.data;
      if (Array.isArray(payload)) {
        return payload;
      }

      return Array.isArray(payload.items) ? payload.items : [];
    }),
  getUnreadCount: async () => {
    try {
      const response = await api.get<{ count?: number; unreadCount?: number }>('/notifications/unread-count');
      return response.data.count ?? response.data.unreadCount ?? 0;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 404 || status === 405 || status === 501) {
        const notifications = await notificationsApi.getAll({ limit: 100 });
        return notifications.filter((item) => !item.isRead).length;
      }

      throw error;
    }
  },
  markRead: (id: string) =>
    api.patch(`/notifications/${id}/read`).then(r => r.data),
  markAllRead: async () => {
    try {
      await api.patch('/notifications/read-all').then(r => r.data);
      return;
    } catch (error) {
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status !== 404 && status !== 405 && status !== 501) {
        throw error;
      }
    }

    const notifications = await notificationsApi.getAll({ limit: 100 });
    await Promise.all(
      notifications
        .filter((item) => !item.isRead)
        .map((item) => notificationsApi.markRead(item.id).catch(() => undefined))
    );
  },
};

// Dashboard API
export const dashboardApi = {
  getDashboard: () =>
    api.get<DashboardData>('/dashboard').then(r => r.data),
};

// Reports API
export const reportsApi = {
  getReports: (params?: { startDate?: string; endDate?: string; groupBy?: string }) =>
    api.get<ReportsData>('/reports', { params }).then(r => r.data),
};
