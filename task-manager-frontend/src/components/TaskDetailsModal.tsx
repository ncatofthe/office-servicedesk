import React, { useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, CheckCircle2, Circle, FileText, GitMerge, Loader2, Mail, MessageCircle, Pencil, RefreshCw, Search, Send, Trash2, X } from 'lucide-react';
import { Modal } from './ui/Modal';
import { CannedReplyPicker } from './canned-replies/CannedReplyPicker';
import { tasksApi, commentsApi, filesApi, knowledgeApi } from '../api';
import { useAuth } from '../contexts/AuthContext';
import { useProductSettings } from '../contexts/ProductSettingsContext';
import { getModuleVisibility } from '../access';
import type {
  CommentVisibility,
  CreateTaskCommentInput,
  TaskCloseConfirmation,
  TaskComment,
  TaskDetail,
  KnowledgeArticle,
  TaskMergeInfo,
  TaskMergeMode,
  TaskMergeRecord,
  TaskMergeReference,
  TaskEmailThread,
  TaskEmailThreadItem,
  TaskPriority,
  TaskStatus,
  TaskSummary,
  TaskTimelineEvent,
  TaskTimelineEventType,
  TeamUser,
} from '../types';
import { getAvailableTaskStatusOptions, getRoleLabel, getStatusLabel, isAssignableRole, priorityLabels } from '../utils';
import type { TaskDepartmentOption } from '../utils/task-departments';

interface Props {
  taskId: string | null;
  open: boolean;
  onClose: () => void;
  onStatusChange?: (task: TaskSummary) => void;
  onTaskUpdated?: (task: TaskSummary) => void;
  onTaskDeleted?: (taskId: string) => void;
  editableUsers?: TeamUser[];
  departmentOptions?: TaskDepartmentOption[];
  availableTasks?: TaskSummary[];
}

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== 'object' || error === null) {
    return fallback;
  }

  const response = (error as { response?: { data?: { error?: string; message?: string } } }).response;
  return response?.data?.error || response?.data?.message || fallback;
};

const toDateInputValue = (value?: string | null) => {
  if (!value) {
    return '';
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const mergeModeLabels: Record<TaskMergeMode, string> = {
  LINK: 'Связать с основной заявкой',
  UNION: 'Объединить в одну заявку',
};

const commentVisibilityLabels: Record<CommentVisibility, string> = {
  PUBLIC: 'Публичный комментарий',
  INTERNAL: 'Внутренняя заметка',
};

const commentVisibilityStyles: Record<CommentVisibility, { badge: string; card: string }> = {
  PUBLIC: {
    badge: 'border border-[#d8dfef] bg-[#f4f7ff] text-[#34507a]',
    card: 'border-[#dfe6f2] bg-[#fbfcff]',
  },
  INTERNAL: {
    badge: 'border border-[#ead7a7] bg-[#fff7dd] text-[#7a5b1d]',
    card: 'border-[#eadfba] bg-[#fffaf0]',
  },
};

const isConfiguredEmailValue = (value?: string | null) => {
  const normalized = value?.trim();
  return Boolean(normalized && !/(^undefined$|^null$|<\s*(undefined|null)\s*>)/i.test(normalized));
};

const formatEmailParty = (name?: string | null, email?: string | null) => {
  if (!isConfiguredEmailValue(email)) {
    return null;
  }

  return name ? `${name} <${email}>` : email;
};

const timelineTypeLabels: Record<TaskTimelineEventType, string> = {
  TASK_CREATED: 'Заявка создана',
  TASK_UPDATED: 'Заявка обновлена',
  STATUS_CHANGED: 'Статус изменён',
  ASSIGNEE_ADDED: 'Исполнитель назначен',
  ASSIGNEE_REMOVED: 'Исполнитель снят',
  COMMENT_ADDED: 'Комментарий',
  INTERNAL_NOTE_ADDED: 'Внутренняя заметка',
  FILE_ATTACHED: 'Файл добавлен',
  FILE_DELETED: 'Файл удалён',
  TASK_MERGED: 'Объединение заявок',
  CLOSE_APPROVED: 'Закрытие подтверждено',
  CANNED_REPLY_USED: 'Шаблон ответа',
  EMAIL_REPLY_SENT: 'Email-ответ',
  SLA_POLICY_APPLIED: 'SLA применён',
  AUTOMATION_APPLIED: 'Автоматизация',
};

const timelineTypeStyles: Record<TaskTimelineEventType, string> = {
  TASK_CREATED: 'border-[#d8dfef] bg-[#f4f7ff] text-[#34507a]',
  TASK_UPDATED: 'border-[#d8dfef] bg-[#f4f7ff] text-[#34507a]',
  STATUS_CHANGED: 'border-[#d9e6d2] bg-[#eef8e8] text-[#41612b]',
  ASSIGNEE_ADDED: 'border-[#d9e6d2] bg-[#eef8e8] text-[#41612b]',
  ASSIGNEE_REMOVED: 'border-[#eee0c8] bg-[#fff7ea] text-[#8a5b14]',
  COMMENT_ADDED: 'border-[#d8dfef] bg-[#f4f7ff] text-[#34507a]',
  INTERNAL_NOTE_ADDED: 'border-[#ead7a7] bg-[#fff7dd] text-[#7a5b1d]',
  FILE_ATTACHED: 'border-[#d8dfef] bg-[#f4f7ff] text-[#34507a]',
  FILE_DELETED: 'border-[#eee0c8] bg-[#fff7ea] text-[#8a5b14]',
  TASK_MERGED: 'border-[#ead7a7] bg-[#fff7dd] text-[#7a5b1d]',
  CLOSE_APPROVED: 'border-[#d9e6d2] bg-[#eef8e8] text-[#41612b]',
  CANNED_REPLY_USED: 'border-[#e1daf2] bg-[#f6f1ff] text-[#5d3a9a]',
  EMAIL_REPLY_SENT: 'border-[#e1daf2] bg-[#f6f1ff] text-[#5d3a9a]',
  SLA_POLICY_APPLIED: 'border-[#d8dfef] bg-[#f4f7ff] text-[#34507a]',
  AUTOMATION_APPLIED: 'border-[#e1daf2] bg-[#f6f1ff] text-[#5d3a9a]',
};

const cannedReplyModeLabels = {
  COMMENT: 'Публичный комментарий',
  EMAIL_REPLY: 'Email-ответ',
} as const;

const emailDirectionLabels: Record<TaskEmailThreadItem['direction'], string> = {
  INBOUND: 'Входящее',
  OUTBOUND: 'Исходящее',
};

const emailStatusLabels: Record<string, string> = {
  RECEIVED: 'Получено',
  DRY_RUN: 'Тестовый режим',
  SENT: 'Отправлено',
  FAILED: 'Ошибка',
  RETRY_PENDING: 'Ожидает повтора',
};

const emailDirectionStyles: Record<TaskEmailThreadItem['direction'], string> = {
  INBOUND: 'border-[#d8dfef] bg-[#f4f7ff] text-[#34507a]',
  OUTBOUND: 'border-[#d9e6d2] bg-[#eef8e8] text-[#41612b]',
};

const emailStatusStyles: Record<string, string> = {
  RECEIVED: 'border-[#d8dfef] bg-[#f4f7ff] text-[#34507a]',
  SENT: 'border-[#d9e6d2] bg-[#eef8e8] text-[#41612b]',
  RETRY_PENDING: 'border-[#eee0c8] bg-[#fff7ea] text-[#8a5b14]',
  FAILED: 'border-[#f3c4c4] bg-[#fff4f4] text-[#b23b3b]',
  DRY_RUN: 'border-[#e1daf2] bg-[#f6f1ff] text-[#5d3a9a]',
};

const mergeMetadataModeLabels = {
  LINK: 'Связь master + child',
  UNION: 'Объединение в одну',
} as const;

const formatRuDateTime = (value: string) =>
  new Date(value).toLocaleString('ru-RU');

const isImageFilename = (filename: string) => /\.(?:jpe?g|png|webp|gif)$/i.test(filename);

const TaskAttachmentImage: React.FC<{ id: string; filename: string }> = ({ id, filename }) => {
  const [imageUrl, setImageUrl] = useState('');

  useEffect(() => {
    let active = true;
    let objectUrl = '';
    void filesApi.getTaskFileBlob(id).then((blob) => {
      if (!active) return;
      objectUrl = window.URL.createObjectURL(blob);
      setImageUrl(objectUrl);
    }).catch(() => undefined);

    return () => {
      active = false;
      if (objectUrl) window.URL.revokeObjectURL(objectUrl);
    };
  }, [id]);

  return imageUrl ? (
    <button
      type="button"
      className="shrink-0 cursor-zoom-in overflow-hidden rounded-[8px] border border-[#dedede] bg-[#f5f5f5]"
      onClick={() => window.open(imageUrl, '_blank', 'noopener,noreferrer')}
      title="Открыть изображение"
    >
      <img src={imageUrl} alt={filename} className="h-20 w-28 object-cover" loading="lazy" />
    </button>
  ) : (
    <div className="flex h-20 w-28 shrink-0 items-center justify-center rounded-[8px] border border-[#e4e4e4] bg-[#f7f7f7] text-[11px] text-[#999]">
      Загрузка…
    </div>
  );
};

const requesterStatusCopy: Record<TaskStatus, { title: string; description: string }> = {
  NEW: {
    title: 'Заявка получена',
    description: 'Команда видит ваше обращение и скоро назначит исполнителя.',
  },
  IN_PROGRESS: {
    title: 'Специалист работает над заявкой',
    description: 'Если понадобятся уточнения, сообщение появится в переписке ниже.',
  },
  REVIEW: {
    title: 'Решение проверяется',
    description: 'Работа почти завершена. Следите за сообщениями и итоговым статусом.',
  },
  POSTPONED: {
    title: 'Работа временно приостановлена',
    description: 'Команда вернётся к заявке после устранения зависимости или получения нужной информации.',
  },
  REWORK: {
    title: 'Заявка возвращена в работу',
    description: 'Специалист уточняет или дорабатывает решение.',
  },
  DONE: {
    title: 'Заявка решена',
    description: 'Работа завершена. Результат и детали можно посмотреть в переписке.',
  },
  MERGED: {
    title: 'Заявка объединена',
    description: 'Обращение связано с другой заявкой, чтобы команда решила вопрос без дублирования.',
  },
};

const asMetadataRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readMetadataString = (metadata: Record<string, unknown> | null, key: string) => {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
};

const readMetadataBoolean = (metadata: Record<string, unknown> | null, key: string) => {
  const value = metadata?.[key];
  return typeof value === 'boolean' ? value : null;
};

const formatTimelineMetadata = (event: TaskTimelineEvent) => {
  const metadata = asMetadataRecord(event.metadata);
  if (!metadata) {
    return [] as string[];
  }

  switch (event.type) {
    case 'STATUS_CHANGED': {
      const fromStatus = readMetadataString(metadata, 'fromStatus');
      const toStatus = readMetadataString(metadata, 'toStatus');
      if (!fromStatus && !toStatus) {
        return [];
      }

      return [
        `${fromStatus ? getStatusLabel(fromStatus as TaskStatus) : 'Не указан'} -> ${toStatus ? getStatusLabel(toStatus as TaskStatus) : 'Не указан'}`,
      ];
    }
    case 'ASSIGNEE_ADDED':
    case 'ASSIGNEE_REMOVED': {
      const assigneeName = readMetadataString(metadata, 'assigneeName');
      return assigneeName ? [assigneeName] : [];
    }
    case 'FILE_ATTACHED':
    case 'FILE_DELETED': {
      const filename = readMetadataString(metadata, 'filename');
      return filename ? [filename] : [];
    }
    case 'CANNED_REPLY_USED': {
      const mode = readMetadataString(metadata, 'mode');
      const templateTitle = readMetadataString(metadata, 'templateTitle');
      const items = [];
      if (templateTitle) {
        items.push(`Шаблон: ${templateTitle}`);
      }
      if (mode === 'COMMENT' || mode === 'EMAIL_REPLY') {
        items.push(`Режим: ${cannedReplyModeLabels[mode]}`);
      }
      return items;
    }
    case 'EMAIL_REPLY_SENT': {
      const items = [];
      const subject = readMetadataString(metadata, 'subject');
      const recipient = readMetadataString(metadata, 'recipient');
      const dryRun = readMetadataBoolean(metadata, 'dryRun');
      if (recipient) {
        items.push(`Получатель: ${recipient}`);
      }
      if (subject) {
        items.push(`Тема: ${subject}`);
      }
      if (dryRun === true) {
        items.push('Письмо не отправлено реально: outbound email выключен');
      }
      return items;
    }
    case 'TASK_MERGED': {
      const items = [];
      const mergeMode = readMetadataString(metadata, 'mergeMode');
      const reason = readMetadataString(metadata, 'reason');
      if (mergeMode === 'LINK' || mergeMode === 'UNION') {
        items.push(`Режим: ${mergeMetadataModeLabels[mergeMode]}`);
      }
      if (reason) {
        items.push(`Причина: ${reason}`);
      }
      return items;
    }
    case 'SLA_POLICY_APPLIED': {
      const policyName = readMetadataString(metadata, 'policyName');
      return policyName ? [`Политика: ${policyName}`] : [];
    }
    case 'AUTOMATION_APPLIED': {
      const ruleName = readMetadataString(metadata, 'ruleName');
      return ruleName ? [`Правило: ${ruleName}`] : [];
    }
    case 'TASK_UPDATED': {
      const changedFields = metadata.changedFields;
      if (Array.isArray(changedFields)) {
        const labels = changedFields.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        return labels.length > 0 ? [`Изменены поля: ${labels.join(', ')}`] : [];
      }
      return [];
    }
    default:
      return [];
  }
};

const asTaskReference = (task: TaskSummary | TaskDetail | TaskMergeReference): TaskMergeReference => ({
  id: task.id,
  ticketNumber: 'ticketNumber' in task ? task.ticketNumber : undefined,
  displayNumber: 'displayNumber' in task ? task.displayNumber : undefined,
  title: task.title,
  status: task.status,
  priority: task.priority,
  createdAt: task.createdAt,
  updatedAt: task.updatedAt,
});

const uniqueTaskReferences = (tasks: Array<TaskMergeReference | null | undefined>) => {
  const seen = new Set<string>();
  return tasks.filter((item): item is TaskMergeReference => {
    if (!item?.id || seen.has(item.id)) {
      return false;
    }

    seen.add(item.id);
    return true;
  });
};

const taskAssigneeUser = (task: TaskDetail | null, userId: string) =>
  task?.assignees.find((assignee) => assignee.userId === userId)?.user || null;

const referenceFromMergeRecord = (record: TaskMergeRecord, side: 'master' | 'child'): TaskMergeReference | null => {
  const task = side === 'master' ? record.masterTask : record.childTask;
  if (task) {
    return task;
  }

  const id = side === 'master' ? record.masterTaskId : record.childTaskId;
  return id ? { id, title: id, displayNumber: undefined } : null;
};

const getTaskDisplayNumber = (task?: { displayNumber?: string | null; ticketNumber?: number | null } | null) =>
  task?.displayNumber || (typeof task?.ticketNumber === 'number' ? `#${task.ticketNumber}` : null);

const isMergeRecord = (item: TaskMergeReference | TaskMergeRecord): item is TaskMergeRecord =>
  'masterTaskId' in item || 'childTaskId' in item;

const normalizeMergeItems = (
  items: Array<TaskMergeReference | TaskMergeRecord | null | undefined>,
  side: 'master' | 'child'
) => uniqueTaskReferences(items.map((item) => {
  if (!item) {
    return null;
  }

  return isMergeRecord(item) ? referenceFromMergeRecord(item, side) : item;
}));

const normalizeMergeInfo = (task: TaskDetail | null, info?: TaskMergeInfo | null): TaskMergeInfo => {
  const source = info || task?.mergeInfo || null;
  const closure = source?.closure || source?.closeConfirmation || task?.closure || task?.closeConfirmation || null;
  const closeApproval = source?.closeApproval || null;
  const approvalConfirmations = closeApproval?.assigneeIds?.map((userId) => {
    const approval = closeApproval.approvals?.find((item) => item.userId === userId);
    const confirmed = Boolean(approval || closeApproval.approvedAssigneeIds?.includes(userId));

    return {
      userId,
      user: approval?.user || taskAssigneeUser(task, userId),
      confirmed,
      confirmedAt: approval?.approvedAt || null,
    };
  }) || [];
  const confirmations = approvalConfirmations.length > 0
    ? approvalConfirmations
    : closure?.confirmations || source?.closeConfirmations || task?.closeConfirmations || [];
  const required = Boolean(
    closeApproval?.required ||
    closure?.required ||
    source?.requiresCloseConfirmation ||
    task?.requiresCloseConfirmation ||
    confirmations.length > 0
  );
  const linkedTasks = normalizeMergeItems(source?.linkedTasks || [], 'child');
  const unionTasks = uniqueTaskReferences([
    ...(source?.unionTasks || []),
    ...normalizeMergeItems(source?.mergedTasks || [], 'child'),
  ]);
  const parentTasks = normalizeMergeItems(source?.parentLinks || [], 'master');
  const firstLinkedRecord = source?.linkedTasks?.find((item): item is TaskMergeRecord => isMergeRecord(item));
  const mode = source?.mode
    || task?.mergeMode
    || source?.mergedTasks?.[0]?.mergeMode
    || source?.parentLinks?.[0]?.mergeMode
    || firstLinkedRecord?.mergeMode
    || null;

  return {
    mode,
    masterTaskId: source?.masterTaskId || task?.masterTaskId || parentTasks[0]?.id || null,
    masterTask: source?.masterTask || task?.masterTask || parentTasks[0] || null,
    childTasks: uniqueTaskReferences([...(source?.childTasks || []), ...(task?.childTasks || [])]),
    linkedTasks,
    unionTasks,
    relatedTasks: uniqueTaskReferences([...(source?.relatedTasks || []), ...(task?.relatedTasks || [])]),
    closeApproval,
    closure: {
      required,
      isComplete: closeApproval
        ? required && (closeApproval.pendingAssigneeIds?.length || 0) === 0
        : closure?.isComplete || (required && confirmations.length > 0 && confirmations.every((item) => item.confirmed)),
      confirmations,
    },
  };
};

export const TaskDetailsModal: React.FC<Props> = ({
  taskId,
  open,
  onClose,
  onStatusChange,
  onTaskUpdated,
  onTaskDeleted,
  editableUsers = [],
  departmentOptions = [],
  availableTasks = [],
}) => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useProductSettings();
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [timeline, setTimeline] = useState<TaskTimelineEvent[]>([]);
  const [emailThread, setEmailThread] = useState<TaskEmailThread | null>(null);
  const [loading, setLoading] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentVisibility, setCommentVisibility] = useState<CommentVisibility>('PUBLIC');
  const [uploading, setUploading] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState(false);
  const [commentSaving, setCommentSaving] = useState(false);
  const [editingCommentId, setEditingCommentId] = useState<string | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');
  const [taskSaving, setTaskSaving] = useState(false);
  const [taskDeleting, setTaskDeleting] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [mergeInfo, setMergeInfo] = useState<TaskMergeInfo | null>(null);
  const [mergeInfoLoading, setMergeInfoLoading] = useState(false);
  const [mergeInfoError, setMergeInfoError] = useState('');
  const [timelineLoading, setTimelineLoading] = useState(false);
  const [timelineError, setTimelineError] = useState('');
  const [emailThreadLoading, setEmailThreadLoading] = useState(false);
  const [emailThreadError, setEmailThreadError] = useState('');
  const [mergeModalOpen, setMergeModalOpen] = useState(false);
  const [mergeMode, setMergeMode] = useState<TaskMergeMode>('LINK');
  const [mergeReason, setMergeReason] = useState('');
  const [mergeTaskIds, setMergeTaskIds] = useState<string[]>([]);
  const [mergeSaving, setMergeSaving] = useState(false);
  const [mergeFormError, setMergeFormError] = useState('');
  const [closeConfirming, setCloseConfirming] = useState(false);
  const [requesterCloseConfirming, setRequesterCloseConfirming] = useState(false);
  const [deletingAttachmentId, setDeletingAttachmentId] = useState<string | null>(null);
  const [knowledgeSearch, setKnowledgeSearch] = useState('');
  const [knowledgeArticles, setKnowledgeArticles] = useState<KnowledgeArticle[]>([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [knowledgeError, setKnowledgeError] = useState('');
  const commentsListRef = useRef<HTMLDivElement>(null);
  const canUpdateStatus = getModuleVisibility(user?.role, 'tasks') !== 'read-only';
  const isAdmin = user?.role === 'ADMIN';
  const isRequesterView = user?.role === 'REQUESTER';
  const canSeeEmailTechnical = user?.role === 'ADMIN' || user?.role === 'AGENT';
  const canCreateComments = user?.role === 'ADMIN' || user?.role === 'AGENT' || user?.role === 'REQUESTER';
  const canCreateInternalNotes = user?.role === 'ADMIN' || user?.role === 'AGENT';
  const canUseCannedReplies = user?.role === 'ADMIN' || user?.role === 'AGENT';
  const assignableEditableUsers = useMemo(
    () => editableUsers.filter((editableUser) => isAssignableRole(editableUser.role)),
    [editableUsers]
  );
  const [titleDraft, setTitleDraft] = useState('');
  const [descriptionDraft, setDescriptionDraft] = useState('');
  const [priorityDraft, setPriorityDraft] = useState<TaskPriority>('MEDIUM');
  const [dueDateDraft, setDueDateDraft] = useState('');
  const [folderIdDraft, setFolderIdDraft] = useState('');
  const [assigneeIdsDraft, setAssigneeIdsDraft] = useState<string[]>([]);
  const [requesterCloseRequiredDraft, setRequesterCloseRequiredDraft] = useState(false);

  const mergedDepartmentOptions = task?.folder?.id && task.folder.name && !departmentOptions.some((folder) => folder.id === task.folder?.id)
    ? [
        ...departmentOptions,
        {
          id: task.folder.id,
          name: task.folder.name,
          isPrimary: false,
        },
      ]
    : departmentOptions;
  const isAssignee = Boolean(task && task.assignees.some((assignee) => assignee.userId === user?.id));
  const isAuthor = Boolean(task && task.authorId === user?.id);
  const statusActionOptions = task
    ? getAvailableTaskStatusOptions(task.status, user?.role, { isAssignee, isAuthor })
    : [];
  const normalizedMergeInfo = normalizeMergeInfo(task, mergeInfo);
  const relatedTasks = uniqueTaskReferences([
    normalizedMergeInfo.masterTask,
    ...(normalizedMergeInfo.childTasks || []),
    ...normalizeMergeItems(normalizedMergeInfo.linkedTasks || [], 'child'),
    ...(normalizedMergeInfo.unionTasks || []),
    ...(normalizedMergeInfo.relatedTasks || []),
  ]).filter((item) => item.id !== taskId);
  const closeState = normalizedMergeInfo.closure || null;
  const currentUserConfirmation = closeState?.confirmations.find((confirmation) => confirmation.userId === user?.id);
  const canConfirmClose = Boolean(closeState?.required && !closeState.isComplete && (!currentUserConfirmation || !currentUserConfirmation.confirmed));
  const mergeCandidateTasks = uniqueTaskReferences(
    availableTasks
      .filter((item) => item.id !== taskId)
      .map(asTaskReference)
  );
  const currentCommentVisibility: CommentVisibility = canCreateInternalNotes ? commentVisibility : 'PUBLIC';
  const publicCommentsCount = useMemo(
    () => comments.filter((comment) => comment.visibility === 'PUBLIC').length,
    [comments]
  );
  const internalCommentsCount = useMemo(
    () => comments.filter((comment) => comment.visibility === 'INTERNAL').length,
    [comments]
  );
  const emailMessages = emailThread?.messages || [];
  const requesterStatus = task ? requesterStatusCopy[task.status] : null;

  useEffect(() => {
    if (!open || comments.length === 0) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const list = commentsListRef.current;
      if (list) {
        list.scrollTop = list.scrollHeight;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [comments.length, open, taskId]);

  const applyTaskContext = (
    updatedTask: TaskDetail,
    updatedComments: TaskComment[],
    updatedMergeResult: { ok: true; data: TaskMergeInfo } | { ok: false; error: unknown },
    updatedTimelineResult: { ok: true; data: TaskTimelineEvent[] } | { ok: false; error: unknown },
    updatedEmailThreadResult: { ok: true; data: TaskEmailThread } | { ok: false; error: unknown }
  ) => {
    setTask(updatedTask);
    setComments(updatedComments);

    if (updatedMergeResult.ok) {
      setMergeInfo(updatedMergeResult.data);
      setMergeInfoError('');
    } else {
      setMergeInfo(normalizeMergeInfo(updatedTask, null));
      const status = (updatedMergeResult.error as { response?: { status?: number } })?.response?.status;
      setMergeInfoError(status === 404 ? '' : getApiErrorMessage(updatedMergeResult.error, 'Не удалось обновить связанные заявки'));
    }

    if (updatedTimelineResult.ok) {
      setTimeline(updatedTimelineResult.data);
      setTimelineError('');
    } else {
      setTimeline([]);
      setTimelineError(getApiErrorMessage(updatedTimelineResult.error, 'Не удалось загрузить историю заявки.'));
    }

    if (!isFeatureEnabled('email')) {
      setEmailThread(null);
      setEmailThreadError('');
    } else if (updatedEmailThreadResult.ok) {
      setEmailThread(updatedEmailThreadResult.data);
      setEmailThreadError('');
    } else {
      setEmailThread(null);
      setEmailThreadError(getApiErrorMessage(updatedEmailThreadResult.error, 'Не удалось загрузить email-переписку.'));
    }
  };

  const fetchTaskContext = async (id: string) => {
    const [updatedTask, updatedComments, updatedMergeResult, updatedTimelineResult, updatedEmailThreadResult] = await Promise.all([
      tasksApi.getById(id),
      commentsApi.getByTask(id),
      tasksApi.getMergeInfo(id).then((data) => ({ ok: true as const, data })).catch((actionError) => ({ ok: false as const, error: actionError })),
      tasksApi.getTimeline(id).then((data) => ({ ok: true as const, data })).catch((actionError) => ({ ok: false as const, error: actionError })),
      isFeatureEnabled('email')
        ? tasksApi.getEmailThread(id).then((data) => ({ ok: true as const, data })).catch((actionError) => ({ ok: false as const, error: actionError }))
        : Promise.resolve({ ok: false as const, error: new Error('Email disabled') }),
    ]);

    return {
      updatedTask,
      updatedComments,
      updatedMergeResult,
      updatedTimelineResult,
      updatedEmailThreadResult,
    };
  };

  useEffect(() => {
    if (!taskId || !open) return;
    const load = async () => {
      setLoading(true);
      setMergeInfoLoading(true);
      setTimelineLoading(true);
      setEmailThreadLoading(isFeatureEnabled('email'));
      setError('');
      setSuccessMessage('');
      setMergeInfoError('');
      setTimelineError('');
      setEmailThreadError('');
      try {
        const context = await fetchTaskContext(taskId);
        applyTaskContext(
          context.updatedTask,
          context.updatedComments,
          context.updatedMergeResult,
          context.updatedTimelineResult,
          context.updatedEmailThreadResult
        );
      } catch {
        setError('Не удалось загрузить заявку');
      } finally {
        setLoading(false);
        setMergeInfoLoading(false);
        setTimelineLoading(false);
        setEmailThreadLoading(false);
      }
    };
    load();
  }, [taskId, open, isFeatureEnabled]);

  useEffect(() => {
    if (!open) {
      setCommentText('');
      setCommentVisibility('PUBLIC');
    }
  }, [open, taskId]);

  useEffect(() => {
    if (!taskId || !open || !isFeatureEnabled('knowledge')) {
      setKnowledgeSearch('');
      setKnowledgeArticles([]);
      setKnowledgeError('');
      return;
    }

    const timeout = window.setTimeout(async () => {
      setKnowledgeLoading(true);
      setKnowledgeError('');
      try {
        const articles = await knowledgeApi.getArticles({
          search: knowledgeSearch.trim() || undefined,
          isPublished: true,
        });
        setKnowledgeArticles(articles.slice(0, 5));
      } catch (loadError) {
        setKnowledgeArticles([]);
        setKnowledgeError(getApiErrorMessage(loadError, 'Не удалось загрузить статьи базы знаний.'));
      } finally {
        setKnowledgeLoading(false);
      }
    }, 250);

    return () => window.clearTimeout(timeout);
  }, [isFeatureEnabled, knowledgeSearch, open, taskId]);

  useEffect(() => {
    if (!task) {
      setTitleDraft('');
      setDescriptionDraft('');
      setPriorityDraft('MEDIUM');
      setDueDateDraft('');
      setFolderIdDraft('');
      setAssigneeIdsDraft([]);
      return;
    }

    setTitleDraft(task.title || '');
    setDescriptionDraft(task.description || '');
    setPriorityDraft(task.priority);
    setDueDateDraft(toDateInputValue(task.dueDate));
    setFolderIdDraft(task.folderId || '');
    setAssigneeIdsDraft(task.assignees.map((assignee) => assignee.userId));
    setRequesterCloseRequiredDraft(Boolean(task.requesterCloseRequired));
  }, [task]);

  const addComment = async () => {
    if (!taskId || !commentText.trim()) return;
    setCommentSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      const nextVisibility = currentCommentVisibility;
      const payload: CreateTaskCommentInput = {
        content: commentText.trim(),
        visibility: nextVisibility,
      };
      await commentsApi.create(taskId, payload);
      setCommentText('');
      setCommentVisibility('PUBLIC');
      await refreshTaskAndMergeInfo(
        nextVisibility === 'INTERNAL'
          ? 'Внутренняя заметка сохранена.'
          : 'Публичный комментарий сохранён.'
      );
    } catch (actionError) {
      setError(getApiErrorMessage(actionError, 'Не удалось добавить комментарий.'));
    } finally {
      setCommentSaving(false);
    }
  };

  const saveEditedComment = async () => {
    if (!editingCommentId || !editingCommentText.trim()) return;
    setCommentSaving(true);
    setError('');
    try {
      await commentsApi.update(editingCommentId, editingCommentText.trim());
      setEditingCommentId(null);
      setEditingCommentText('');
      await refreshTaskAndMergeInfo('Сообщение обновлено.');
    } catch (actionError) {
      setError(getApiErrorMessage(actionError, 'Не удалось обновить сообщение.'));
    } finally {
      setCommentSaving(false);
    }
  };

  const deleteComment = async (comment: TaskComment) => {
    if (!window.confirm('Удалить это сообщение из переписки?')) return;
    setCommentSaving(true);
    setError('');
    try {
      await commentsApi.delete(comment.id);
      await refreshTaskAndMergeInfo('Сообщение удалено.');
    } catch (actionError) {
      setError(getApiErrorMessage(actionError, 'Не удалось удалить сообщение.'));
    } finally {
      setCommentSaving(false);
    }
  };

  const insertKnowledgeText = (article: KnowledgeArticle) => {
    const articleText = [article.title, article.body].filter(Boolean).join('\n\n').trim();
    setCommentText((current) => (current.trim() ? `${current.trim()}\n\n${articleText}` : articleText));
    setSuccessMessage('Текст статьи добавлен в поле комментария.');
  };

  const uploadFile = async (files: FileList | null) => {
    if (!files || !taskId) return;
    setUploading(true);
    setError('');
    setSuccessMessage('');
    try {
      await Promise.all(Array.from(files).map((f) => filesApi.uploadTaskFile(taskId, f)));
      await refreshTaskAndMergeInfo('Файлы прикреплены.');
    } catch {
      setError('Не удалось загрузить файлы');
    } finally {
      setUploading(false);
    }
  };

  const changeStatus = async (status: TaskStatus) => {
    if (!taskId) return;
    setStatusUpdating(true);
    setError('');
    setSuccessMessage('');
    try {
      const updated = await tasksApi.updateStatus(taskId, status);
      await refreshTaskAndMergeInfo('Заявка обновлена.');
      onStatusChange?.(updated);
    } catch (actionError) {
      setError(getApiErrorMessage(actionError, 'Не удалось изменить статус заявки'));
    } finally {
      setStatusUpdating(false);
    }
  };

  const saveTask = async () => {
    if (!taskId || !task || !isAdmin) {
      return;
    }

    if (!titleDraft.trim()) {
      setError('Введите название заявки.');
      return;
    }

    setTaskSaving(true);
    setError('');
    setSuccessMessage('');
    try {
      const updated = await tasksApi.update(taskId, {
        title: titleDraft.trim(),
        description: descriptionDraft.trim() || null,
        priority: priorityDraft,
        dueDate: dueDateDraft || null,
        folderId: folderIdDraft || null,
        requesterCloseRequired: requesterCloseRequiredDraft,
        assigneeIds: assigneeIdsDraft,
      });
      await refreshTaskAndMergeInfo('Изменения сохранены.');
      onTaskUpdated?.(updated);
    } catch (actionError) {
      setError(getApiErrorMessage(actionError, 'Не удалось сохранить изменения заявки.'));
    } finally {
      setTaskSaving(false);
    }
  };

  const deleteTask = async () => {
    if (!taskId || !task || !isAdmin) {
      return;
    }

    const confirmed = window.confirm(
      `Удалить заявку «${task.title}»? Комментарии, вложения и история по этой заявке также будут удалены. Это действие нельзя отменить.`
    );

    if (!confirmed) {
      return;
    }

    setTaskDeleting(true);
    setError('');
    setSuccessMessage('');
    try {
      await tasksApi.delete(taskId);
      onTaskDeleted?.(taskId);
      onClose();
    } catch (actionError) {
      setError(getApiErrorMessage(actionError, 'Не удалось удалить заявку.'));
    } finally {
      setTaskDeleting(false);
    }
  };

  const downloadAttachment = async (attachmentId: string, filename: string) => {
    try {
      await filesApi.downloadTaskFile(attachmentId, filename);
    } catch (actionError) {
      setError(getApiErrorMessage(actionError, 'Не удалось скачать файл'));
    }
  };

  const deleteAttachment = async (attachmentId: string, filename: string) => {
    const confirmed = window.confirm(`Удалить вложение «${filename}»?`);
    if (!confirmed) {
      return;
    }

    setDeletingAttachmentId(attachmentId);
    setError('');
    setSuccessMessage('');
    try {
      await filesApi.deleteTaskFile(attachmentId);
      await refreshTaskAndMergeInfo('Вложение удалено.');
    } catch (actionError) {
      setError(getApiErrorMessage(actionError, 'Не удалось удалить вложение.'));
    } finally {
      setDeletingAttachmentId(null);
    }
  };

  const refreshTaskAndMergeInfo = async (successText?: string) => {
    if (!taskId) {
      return;
    }

    setMergeInfoLoading(true);
    setTimelineLoading(true);
    setEmailThreadLoading(true);
    try {
      const context = await fetchTaskContext(taskId);
      applyTaskContext(
        context.updatedTask,
        context.updatedComments,
        context.updatedMergeResult,
        context.updatedTimelineResult,
        context.updatedEmailThreadResult
      );

      if (successText) {
        setSuccessMessage(successText);
      }

      onTaskUpdated?.(context.updatedTask);
    } finally {
      setMergeInfoLoading(false);
      setTimelineLoading(false);
      setEmailThreadLoading(false);
    }
  };

  const openMergeDialog = () => {
    setMergeFormError('');
    setMergeTaskIds([]);
    setMergeMode('LINK');
    setMergeReason('');
    setMergeModalOpen(true);
  };

  const mergeTasks = async () => {
    if (!taskId) {
      return;
    }

    if (mergeTaskIds.length === 0) {
      setMergeFormError('Выберите хотя бы одну заявку для объединения.');
      return;
    }

    if (!mergeReason.trim()) {
      setMergeFormError('Укажите причину объединения.');
      return;
    }

    setMergeSaving(true);
    setMergeFormError('');
    setError('');
    setSuccessMessage('');
    try {
      const response = await tasksApi.merge(taskId, {
        childTaskIds: mergeTaskIds,
        mergeMode,
        reason: mergeReason.trim(),
      });

      if (response.mergeInfo) {
        setMergeInfo(response.mergeInfo);
      }

      setMergeModalOpen(false);
      await refreshTaskAndMergeInfo('Заявки объединены.');
    } catch (actionError) {
      setMergeFormError(getApiErrorMessage(actionError, 'Не удалось объединить заявки.'));
    } finally {
      setMergeSaving(false);
    }
  };

  const confirmClose = async () => {
    if (!taskId) {
      return;
    }

    setCloseConfirming(true);
    setError('');
    setSuccessMessage('');
    try {
      const response = await tasksApi.confirmClose(taskId);
      if (response.mergeInfo) {
        setMergeInfo(response.mergeInfo);
      } else if (response.closure) {
        setMergeInfo((current) => ({
          ...normalizeMergeInfo(task, current),
          closure: response.closure,
        }));
      }

      await refreshTaskAndMergeInfo(response.message || 'Подтверждение закрытия сохранено.');
    } catch (actionError) {
      setError(getApiErrorMessage(actionError, 'Не удалось подтвердить закрытие заявки.'));
    } finally {
      setCloseConfirming(false);
    }
  };

  const confirmRequesterClose = async () => {
    if (!taskId) {
      return;
    }

    setRequesterCloseConfirming(true);
    setError('');
    setSuccessMessage('');
    try {
      const response = await tasksApi.confirmRequesterClose(taskId);
      await refreshTaskAndMergeInfo(response.message || 'Закрытие подтверждено заявителем.');
      if (response.task) {
        onTaskUpdated?.(response.task);
      }
    } catch (actionError) {
      setError(getApiErrorMessage(actionError, 'Не удалось подтвердить закрытие заявки.'));
    } finally {
      setRequesterCloseConfirming(false);
    }
  };

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      title={task
        ? isRequesterView
          ? `Заявка ${getTaskDisplayNumber(task) || ''}`.trim()
          : `${getTaskDisplayNumber(task) || ''} ${task.title}`.trim()
        : 'Загрузка...'}
      testId="task-details-modal"
      size="wide"
    >
      {loading ? (
        <div className="flex items-center justify-center gap-3 py-8 text-center text-gray-500">
          <Loader2 size={18} className="animate-spin" />
          <span>Загружаем заявку...</span>
        </div>
      ) : task ? (
        <div className="space-y-4">
          {error && (
            <div className="rounded-[12px] border border-[#f3c4c4] bg-[#fff4f4] px-4 py-3 text-sm text-[#b23b3b]">
              {error}
            </div>
          )}
          {successMessage && (
            <div className="rounded-[12px] border border-[#b8e4c6] bg-[#eef9f2] px-4 py-3 text-sm text-[#1f7a42]">
              {successMessage}
            </div>
          )}
          <div className="rounded-[14px] border border-[#e3e3e3] bg-white p-4">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
              <div className="min-w-0">
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm text-[#616161]">
                  {getTaskDisplayNumber(task) && (
                    <span className="rounded-full bg-[#2f2f2f] px-2.5 py-1 text-[11px] font-semibold text-white shadow-[0_6px_16px_rgba(0,0,0,0.14)]" data-testid="task-details-ticket-number">
                      {getTaskDisplayNumber(task)}
                    </span>
                  )}
                  <span className="rounded-[10px] border border-[#e2e2e2] bg-[#f5f5f5] px-2 py-1" data-testid="task-details-current-status">
                    {getStatusLabel(task.status)}
                  </span>
                  {!isRequesterView && <span className="rounded-[10px] border border-[#e2e2e2] bg-[#f5f5f5] px-2 py-1">
                    {priorityLabels[task.priority] || task.priority}
                  </span>}
                  {!isRequesterView && task.folder?.name && (
                    <span className="rounded-[10px] border border-[#e2e2e2] bg-[#f5f5f5] px-2 py-1">
                      {task.folder.name}
                    </span>
                  )}
                  {!isRequesterView && (task.channel || task.sourceChannel) && (
                    <span className="rounded-[10px] border border-[#e2e2e2] bg-[#f5f5f5] px-2 py-1">
                      Канал: {String(task.channel || task.sourceChannel).toUpperCase() === 'EMAIL' ? 'Email' : 'Web'}
                    </span>
                  )}
                </div>
                <h2 className="text-xl font-semibold text-[#1f1f1f]">{task.title}</h2>
                {task.description ? (
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[#333333]">{task.description}</p>
                ) : (
                  <p className="mt-3 text-sm text-[#8a8a8a]">Описание не указано.</p>
                )}
              </div>

              <div className={`w-full rounded-[12px] border p-3 ${isRequesterView ? 'max-w-[390px] border-[#dfe6f2] bg-[#f6f8fc]' : 'max-w-[340px] border-[#ececec] bg-[#fcfcfc]'}`}>
                {isRequesterView ? (
                  <div>
                    <p className="text-sm font-semibold text-[#26364f]">{requesterStatus?.title || getStatusLabel(task.status)}</p>
                    <p className="mt-1 text-xs leading-5 text-[#647086]">{requesterStatus?.description}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-[#5f6878]">
                      <span>Исполнитель:</span>
                      <span className="font-semibold text-[#273448]">
                        {task.assignees?.map((assignee) => assignee.user.name).join(', ') || 'ещё не назначен'}
                      </span>
                    </div>
                    {task.requesterCloseRequired && !task.requesterCloseApprovedAt && isAuthor && (
                      <button
                        type="button"
                        className="btn btn-primary mt-3 w-full"
                        onClick={confirmRequesterClose}
                        disabled={requesterCloseConfirming}
                      >
                        {requesterCloseConfirming ? 'Подтверждаем...' : 'Подтвердить, что вопрос решён'}
                      </button>
                    )}
                  </div>
                ) : (
                  <>
                  <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7a7a7a]">Быстрые действия</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {canUpdateStatus ? (
                    statusActionOptions.length > 0 ? (
                      statusActionOptions.map((option) => (
                        <button
                          key={option.value}
                          className="rounded-[10px] border border-[#dedede] bg-white px-3 py-1.5 text-xs text-[#5a5a5a] transition-colors"
                          disabled={statusUpdating || taskSaving || taskDeleting}
                          onClick={() => changeStatus(option.value as TaskStatus)}
                          data-testid={`task-status-action-${option.value}`}
                        >
                          {option.label}
                        </button>
                      ))
                    ) : (
                      <span className="chip">Нет доступных переходов</span>
                    )
                  ) : (
                    <span className="chip">Только просмотр</span>
                    )}
                  </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className={`grid grid-cols-1 gap-4 ${isRequesterView ? 'xl:grid-cols-[minmax(0,1fr)_300px]' : 'xl:grid-cols-3'}`}>
            <div className={`space-y-4 ${isRequesterView ? '' : 'xl:col-span-2'}`}>
              <div className="rounded-[14px] border border-[#dfe3ea] bg-white p-3 shadow-sm">
                <div className="mb-3 flex items-center gap-2">
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-[#eef3ff] text-[#34507a]">
                    <MessageCircle size={17} />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#20242b]">{isRequesterView ? 'Переписка со специалистом' : 'Переписка по заявке'}</p>
                    <p className="text-xs text-[#7a808a]">
                      {isRequesterView ? 'Задайте вопрос или добавьте важную информацию' : 'Ответы участников в хронологическом порядке'}
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-3">
                  {canCreateComments ? (
                    <div className="order-3 rounded-[14px] border border-[#d9dfeb] bg-white p-3 space-y-3">
                      {canCreateInternalNotes ? (
                        <div className="space-y-2">
                          <label className="block text-sm font-medium text-[#4a4a4a]" htmlFor="comment-visibility">
                            Тип сообщения
                          </label>
                          <select
                            id="comment-visibility"
                            className="input w-full sm:max-w-[280px]"
                            value={commentVisibility}
                            onChange={(event) => setCommentVisibility(event.target.value as CommentVisibility)}
                            disabled={commentSaving || taskSaving || taskDeleting}
                            data-testid="internal-note-selector"
                          >
                            <option value="PUBLIC">Публичный комментарий</option>
                            <option value="INTERNAL">Внутренняя заметка</option>
                          </select>
                          <p className="text-xs text-[#8a8a8a]">
                            {currentCommentVisibility === 'INTERNAL'
                              ? 'Эту заметку увидят только исполнители и администраторы.'
                              : 'Этот комментарий увидят и исполнители, и заявитель.'}
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-[10px] border border-[#dfe6f2] bg-[#fbfcff] px-3 py-2 text-xs text-[#4f6488]">
                          Напишите специалисту — сообщение сразу появится в общей переписке по заявке.
                        </div>
                      )}

                      <div className="space-y-2">
                        <textarea
                          className="input min-h-[88px] resize-y rounded-[12px]"
                          rows={3}
                          placeholder={currentCommentVisibility === 'INTERNAL' ? 'Внутренняя заметка для команды…' : 'Напишите сообщение…'}
                          value={commentText}
                          onChange={(event) => setCommentText(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' && !event.shiftKey) {
                              event.preventDefault();
                              if (commentText.trim() && !commentSaving) void addComment();
                            }
                          }}
                          disabled={commentSaving || taskSaving || taskDeleting}
                          data-testid="comment-input"
                        />
                        <div className="flex items-center justify-between gap-3">
                          <span className="text-[11px] text-[#8a8f98]">Enter — отправить · Shift+Enter — новая строка</span>
                          <button
                            className="btn btn-primary inline-flex items-center gap-2"
                            onClick={addComment}
                            disabled={!commentText.trim() || commentSaving || taskSaving || taskDeleting}
                            data-testid="comment-submit"
                          >
                            <Send size={15} />
                            {commentSaving ? 'Отправляем...' : currentCommentVisibility === 'INTERNAL' ? 'Сохранить заметку' : 'Отправить'}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="order-3 rounded-[12px] border border-dashed border-[#d7d7d7] bg-[#fcfcfc] px-4 py-3 text-sm text-[#6b6b6b]">
                      Для вашей роли доступен только просмотр публичной переписки.
                    </div>
                  )}

                  {!isRequesterView && isFeatureEnabled('knowledge') && <div className="order-6 rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <BookOpen size={16} className="text-[#5f5f5f]" />
                      <p className="text-sm font-semibold text-[#1f1f1f]">База знаний</p>
                    </div>
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8a8a]" size={15} />
                      <input
                        className="input pl-9"
                        placeholder="Найти инструкцию или решение"
                        value={knowledgeSearch}
                        onChange={(event) => setKnowledgeSearch(event.target.value)}
                      />
                    </div>
                    {knowledgeLoading ? (
                      <div className="flex items-center gap-2 rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-3 text-sm text-[#6b6b6b]">
                        <Loader2 size={16} className="animate-spin" />
                        Ищем статьи...
                      </div>
                    ) : knowledgeError ? (
                      <div className="rounded-[10px] border border-[#f3c4c4] bg-[#fff4f4] px-3 py-3 text-sm text-[#b23b3b]">
                        {knowledgeError}
                      </div>
                    ) : knowledgeArticles.length === 0 ? (
                      <div className="rounded-[10px] border border-dashed border-[#dddddd] bg-white px-3 py-4 text-sm text-[#6b6b6b]">
                        Подходящих статей не найдено.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {knowledgeArticles.map((article) => (
                          <div key={article.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <p className="font-medium text-[#1f1f1f]">{article.title}</p>
                              <p className="text-xs text-[#8a8a8a]">{article.category || 'Без категории'}</p>
                              <p className="mt-1 max-h-10 overflow-hidden text-xs leading-5 text-[#5f5f5f]">
                                {article.body.replace(/\s+/g, ' ').slice(0, 180)}
                                {article.body.length > 180 ? '...' : ''}
                              </p>
                            </div>
                            <button
                              type="button"
                              className="btn inline-flex items-center gap-2"
                              onClick={() => insertKnowledgeText(article)}
                              disabled={!canCreateComments || commentSaving || taskSaving || taskDeleting}
                            >
                              <FileText size={14} />
                              Вставить текст
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>}

                  {canUseCannedReplies && isFeatureEnabled('cannedReplies') && taskId && (
                    <div className="order-4">
                      <CannedReplyPicker
                        taskId={taskId}
                        disabled={loading || commentSaving || taskSaving || taskDeleting}
                        onApplied={(message) => refreshTaskAndMergeInfo(message)}
                      />
                    </div>
                  )}

                  {!isRequesterView && isFeatureEnabled('email') && <div className="order-5 rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] p-4 space-y-3" data-testid="task-email-thread">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <Mail size={16} className="text-[#5f5f5f]" />
                          <p className="text-sm font-semibold text-[#1f1f1f]">Email-переписка</p>
                        </div>
                        <p className="mt-1 text-xs text-[#8a8a8a]">
                          {canSeeEmailTechnical
                            ? 'Входящие и исходящие письма по заявке, включая статусы отправки.'
                            : 'История входящих и исходящих писем по заявке.'}
                        </p>
                      </div>
                    </div>

                    {emailThreadLoading ? (
                      <div className="flex items-center gap-2 rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-3 text-sm text-[#6b6b6b]">
                        <Loader2 size={16} className="animate-spin" />
                        Загружаем email-переписку...
                      </div>
                    ) : emailThreadError ? (
                      <div className="rounded-[10px] border border-[#f3c4c4] bg-[#fff4f4] px-3 py-3 text-sm text-[#b23b3b]">
                        {emailThreadError}
                      </div>
                    ) : emailMessages.length === 0 ? (
                      <div className="rounded-[10px] border border-dashed border-[#dddddd] bg-white px-3 py-4 text-sm text-[#6b6b6b]">
                        По этой заявке пока нет email-переписки.
                      </div>
                    ) : (
                      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                        {emailMessages.map((message) => (
                          <div
                            key={message.id}
                            className={`rounded-[10px] border p-3 ${message.direction === 'OUTBOUND' ? 'border-[#d9e6d2] bg-[#fbfef9]' : 'border-[#d8dfef] bg-[#fbfcff]'}`}
                            data-testid="task-email-thread-item"
                          >
                            <div className="flex flex-wrap items-center gap-2">
                              <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${emailDirectionStyles[message.direction]}`}>
                                {emailDirectionLabels[message.direction]}
                              </span>
                              <span className="text-[11px] text-[#8a8a8a]">
                                {formatRuDateTime(message.createdAt)}
                              </span>
                              {canSeeEmailTechnical && message.status && (
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${emailStatusStyles[message.status] || 'border-[#d8dfef] bg-[#f4f7ff] text-[#34507a]'}`}>
                                  {emailStatusLabels[message.status] || message.status}
                                </span>
                              )}
                            </div>

                            {(message.subject || message.textPreview) && (
                              <p className="mt-2 text-sm font-medium text-[#1f1f1f]">
                                {message.subject || 'Без темы'}
                              </p>
                            )}

                            <div className="mt-1 space-y-1 text-xs text-[#5f5f5f]">
                              {formatEmailParty(message.fromName, message.fromEmail) ? (
                                <p>От: {formatEmailParty(message.fromName, message.fromEmail)}</p>
                              ) : canSeeEmailTechnical && message.direction === 'OUTBOUND' ? (
                                <p>От: отправитель не настроен</p>
                              ) : null}
                              {isConfiguredEmailValue(message.toEmail) && <p>Кому: {message.toEmail}</p>}
                              {message.textPreview && <p className="text-sm text-[#3f3f3f] whitespace-pre-wrap">{message.textPreview}</p>}
                              {canSeeEmailTechnical && typeof message.attempts === 'number' && (
                                <p>Попыток отправки: {message.attempts}</p>
                              )}
                              {canSeeEmailTechnical && message.nextRetryAt && (
                                <p>Следующий повтор: {formatRuDateTime(message.nextRetryAt)}</p>
                              )}
                              {canSeeEmailTechnical && message.errorMessage && (
                                <p className="rounded-[8px] border border-[#f3c4c4] bg-[#fff4f4] px-2 py-1 text-[#b23b3b]">
                                  {message.errorMessage}
                                </p>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>}

                  <div className="order-1">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1f1f1f]">{isRequesterView ? 'Сообщения' : 'Комментарии и заметки'}</p>
                        <p className="mt-1 text-xs text-[#8a8a8a]">
                          {canCreateInternalNotes
                            ? 'Внутренние заметки видны только исполнителям и администраторам.'
                            : 'Все ответы по вашему обращению собраны здесь.'}
                        </p>
                      </div>
                      {!isRequesterView && <div className="flex flex-wrap gap-2 text-xs text-[#5f5f5f]">
                        <span className="rounded-full border border-[#dfe6f2] bg-[#fbfcff] px-2.5 py-1">
                          Публичные: {publicCommentsCount}
                        </span>
                        {canCreateInternalNotes && (
                          <span className="rounded-full border border-[#eadfba] bg-[#fffaf0] px-2.5 py-1">
                            Внутренние: {internalCommentsCount}
                          </span>
                        )}
                      </div>}
                    </div>
                  </div>

                  <div ref={commentsListRef} className="order-2 max-h-[430px] overflow-y-auto rounded-[14px] bg-[#f5f7fb] px-3 py-4 space-y-3" data-testid="comments-list">
                    {comments.map((c) => {
                      const isOwn = c.authorId === user?.id;
                      const canDelete = isOwn || user?.role === 'ADMIN';
                      const isInternal = c.visibility === 'INTERNAL';
                      const isEditing = editingCommentId === c.id;
                      return (
                        <div
                          key={c.id}
                          className={`flex ${isInternal ? 'justify-center' : isOwn ? 'justify-end' : 'justify-start'}`}
                          data-testid="comment-item"
                        >
                          <div className={`group max-w-[86%] sm:max-w-[72%] rounded-[16px] px-3.5 py-3 shadow-sm ${
                            isInternal
                              ? 'border border-[#ead7a7] bg-[#fff8df]'
                              : isOwn
                                ? 'rounded-br-[5px] bg-[#34507a] text-white'
                                : 'rounded-bl-[5px] border border-[#e1e5ec] bg-white text-[#252a31]'
                          }`}>
                            <div className="mb-1.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
                              <span className={`text-xs font-semibold ${isOwn && !isInternal ? 'text-white' : 'text-[#39404a]'}`}>
                                {c.author?.name || 'Участник'}
                              </span>
                              <span className={`text-[10px] ${isOwn && !isInternal ? 'text-white/70' : 'text-[#8a8f98]'}`}>
                                {new Date(c.createdAt).toLocaleString('ru-RU', { dateStyle: 'short', timeStyle: 'short' })}
                              </span>
                            </div>
                            {isInternal && (
                              <span className={`mb-2 inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${commentVisibilityStyles.INTERNAL.badge}`}>
                                {commentVisibilityLabels.INTERNAL}
                              </span>
                            )}
                            {isEditing ? (
                              <div className="space-y-2">
                                <textarea
                                  className="input min-h-[84px] bg-white"
                                  value={editingCommentText}
                                  onChange={(event) => setEditingCommentText(event.target.value)}
                                  disabled={commentSaving}
                                  autoFocus
                                />
                                <div className="flex justify-end gap-2">
                                  <button type="button" className="btn h-8 px-2" onClick={() => { setEditingCommentId(null); setEditingCommentText(''); }}>
                                    <X size={14} /> Отмена
                                  </button>
                                  <button type="button" className="btn btn-primary h-8 px-2" onClick={() => void saveEditedComment()} disabled={!editingCommentText.trim() || commentSaving}>
                                    Сохранить
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <>
                                <p className={`text-sm whitespace-pre-wrap break-words ${isOwn && !isInternal ? 'text-white' : 'text-[#2a2f36]'}`}>{c.content}</p>
                                {(isOwn || canDelete) && (
                                  <div className={`mt-2 flex justify-end gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 ${isOwn && !isInternal ? 'text-white/80' : 'text-[#707781]'}`}>
                                    {isOwn && (
                                      <button type="button" className="rounded p-1 hover:bg-black/10" title="Редактировать" onClick={() => { setEditingCommentId(c.id); setEditingCommentText(c.content); }}>
                                        <Pencil size={13} />
                                      </button>
                                    )}
                                    {canDelete && (
                                      <button type="button" className="rounded p-1 hover:bg-black/10" title="Удалить" onClick={() => void deleteComment(c)}>
                                        <Trash2 size={13} />
                                      </button>
                                    )}
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {comments.length === 0 && (
                      <p className="text-sm text-[#8a8a8a]">
                        {isRequesterView ? 'Сообщений пока нет. Напишите, если хотите что-то уточнить или дополнить.' : 'Пока нет ни публичных комментариев, ни внутренних заметок.'}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                {!isRequesterView && <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] p-4 space-y-3" data-testid="task-timeline">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-[#1f1f1f]">История заявки</p>
                      <p className="mt-1 text-xs text-[#8a8a8a]">
                        Последние действия по заявке в helpdesk-потоке.
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn inline-flex items-center gap-2"
                      onClick={() => void refreshTaskAndMergeInfo()}
                      disabled={loading || timelineLoading || commentSaving || taskSaving || taskDeleting || mergeSaving || closeConfirming}
                      data-testid="task-timeline-refresh"
                    >
                      <RefreshCw size={14} className={timelineLoading ? 'animate-spin' : ''} />
                      Обновить
                    </button>
                  </div>

                  {timelineLoading ? (
                    <div className="flex items-center gap-2 rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-3 text-sm text-[#6b6b6b]">
                      <Loader2 size={16} className="animate-spin" />
                      Загружаем историю...
                    </div>
                  ) : timelineError ? (
                    <div
                      className="rounded-[10px] border border-[#f3c4c4] bg-[#fff4f4] px-3 py-3 text-sm text-[#b23b3b]"
                      data-testid="task-timeline-error"
                    >
                      {timelineError || 'Не удалось загрузить историю заявки.'}
                    </div>
                  ) : timeline.length === 0 ? (
                    <div
                      className="rounded-[10px] border border-dashed border-[#dddddd] bg-white px-3 py-4 text-sm text-[#6b6b6b]"
                      data-testid="task-timeline-empty"
                    >
                      История пока пуста.
                    </div>
                  ) : (
                    <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
                      {timeline.map((event) => {
                        const metadataLines = formatTimelineMetadata(event);
                        return (
                          <div key={event.id} className="flex gap-3" data-testid="task-timeline-item">
                            <div className="flex w-5 flex-col items-center">
                              <span className="mt-1 h-2.5 w-2.5 rounded-full bg-[#2f2f2f]" />
                              <span className="mt-1 min-h-[36px] w-px flex-1 bg-[#e3e3e3]" />
                            </div>
                            <div className="min-w-0 flex-1 rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-3">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold ${timelineTypeStyles[event.type]}`}>
                                  {timelineTypeLabels[event.type]}
                                </span>
                                <span className="text-[11px] text-[#8a8a8a]">
                                  {formatRuDateTime(event.createdAt)}
                                </span>
                                <span className="text-[11px] text-[#8a8a8a]">
                                  {event.actor?.name || 'Система'}
                                </span>
                              </div>
                              <p className="mt-2 text-sm font-medium text-[#1f1f1f]">
                                {event.title || timelineTypeLabels[event.type]}
                              </p>
                              {event.description && (
                                <p className="mt-1 text-sm whitespace-pre-wrap text-[#5f5f5f]">
                                  {event.description}
                                </p>
                              )}
                              {metadataLines.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {metadataLines.map((line) => (
                                    <p key={`${event.id}-${line}`} className="text-xs text-[#7a7a7a]">
                                      {line}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>}

                <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] p-4 space-y-3">
                  {!isRequesterView && <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-semibold text-[#1f1f1f]">Связанные/объединённые заявки</p>
                        <p className="mt-1 text-xs text-[#8a8a8a]">
                          {normalizedMergeInfo.mode ? `Режим: ${mergeModeLabels[normalizedMergeInfo.mode]}` : 'Заявка пока не объединялась.'}
                        </p>
                      </div>
                      {canUpdateStatus && (
                        <button type="button" className="btn inline-flex items-center gap-2" onClick={openMergeDialog}>
                          <GitMerge size={15} />
                          Объединить
                        </button>
                      )}
                    </div>

                    {mergeInfoLoading ? (
                      <div className="flex items-center gap-2 rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-3 text-sm text-[#6b6b6b]">
                        <Loader2 size={16} className="animate-spin" />
                        Загружаем связи...
                      </div>
                    ) : mergeInfoError ? (
                      <div className="rounded-[10px] border border-[#f3c4c4] bg-[#fff4f4] px-3 py-3 text-sm text-[#b23b3b]">
                        {mergeInfoError}
                      </div>
                    ) : relatedTasks.length === 0 ? (
                      <div className="rounded-[10px] border border-dashed border-[#dddddd] bg-white px-3 py-4 text-sm text-[#6b6b6b]">
                        Связанных заявок нет.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {normalizedMergeInfo.masterTaskId && (
                          <div className="rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-2 text-sm">
                            <span className="font-semibold text-[#1f1f1f]">Мастер:</span>{' '}
                            <span className="text-[#4a4a4a]">
                              {[getTaskDisplayNumber(normalizedMergeInfo.masterTask), normalizedMergeInfo.masterTask?.title || normalizedMergeInfo.masterTaskId].filter(Boolean).join(' · ')}
                            </span>
                          </div>
                        )}
                        {relatedTasks.map((relatedTask) => (
                          <div key={relatedTask.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-2 text-sm">
                            <div className="min-w-0">
                              <p className="font-medium text-[#1f1f1f]">{relatedTask.title}</p>
                              <p className="text-xs text-[#8a8a8a]">
                                {[getTaskDisplayNumber(relatedTask), relatedTask.id].filter(Boolean).join(' · ')}
                              </p>
                            </div>
                            {relatedTask.status && <span className="chip">{getStatusLabel(relatedTask.status)}</span>}
                          </div>
                        ))}
                      </div>
                    )}

                    {closeState?.required && (
                      <div className="space-y-3 rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-[#1f1f1f]">Согласованное закрытие</p>
                            <p className="mt-1 text-xs text-[#8a8a8a]">
                              {closeState.isComplete ? 'Все исполнители подтвердили закрытие.' : 'Закрытие ждёт подтверждения исполнителей.'}
                            </p>
                          </div>
                          {canConfirmClose && (
                            <button type="button" className="btn btn-primary" onClick={confirmClose} disabled={closeConfirming}>
                              {closeConfirming ? 'Подтверждаем...' : 'Подтвердить закрытие'}
                            </button>
                          )}
                        </div>
                        {closeState.confirmations.length === 0 ? (
                          <p className="text-sm text-[#8a8a8a]">Список подтверждений пока пуст.</p>
                        ) : (
                          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                            {closeState.confirmations.map((confirmation: TaskCloseConfirmation) => (
                              <div key={confirmation.userId} className="flex items-center gap-2 rounded-[10px] border border-[#ededed] px-3 py-2 text-sm">
                                {confirmation.confirmed ? (
                                  <CheckCircle2 size={16} className="text-[#1f7a42]" />
                                ) : (
                                  <Circle size={16} className="text-[#8a8a8a]" />
                                )}
                                <div>
                                  <p className="font-medium text-[#1f1f1f]">{confirmation.user?.name || confirmation.userId}</p>
                                  <p className="text-xs text-[#8a8a8a]">
                                    {confirmation.confirmed
                                      ? `Подтверждено${confirmation.confirmedAt ? ` ${new Date(confirmation.confirmedAt).toLocaleString('ru-RU')}` : ''}`
                                      : 'Ожидает подтверждения'}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                    {task.requesterCloseRequired && (
                      <div className="space-y-3 rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-[#1f1f1f]">Подтверждение заявителя</p>
                            <p className="mt-1 text-xs text-[#8a8a8a]">
                              {task.requesterCloseApprovedAt
                                ? `Подтверждено ${new Date(task.requesterCloseApprovedAt).toLocaleString('ru-RU')}`
                                : 'Эту заявку нельзя закрыть без подтверждения заявителя.'}
                            </p>
                          </div>
                          {(isAuthor || isAdmin) && !task.requesterCloseApprovedAt && (
                            <button
                              type="button"
                              className="btn btn-primary"
                              onClick={confirmRequesterClose}
                              disabled={requesterCloseConfirming}
                            >
                              {requesterCloseConfirming ? 'Подтверждаем...' : 'Подтвердить'}
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                  </div>}

                  {isFeatureEnabled('taskAttachments') && <div className="space-y-2">
                    <div>
                      <p className="text-sm font-semibold text-[#1f1f1f]">{isRequesterView ? 'Файлы и скриншоты' : 'Файлы'}</p>
                      {isRequesterView && <p className="mt-1 text-xs text-[#8a8a8a]">Добавьте изображение ошибки или документ, если это поможет разобраться.</p>}
                    </div>
                    <div className="flex items-center gap-3">
                      <label className={`btn ${uploading || taskSaving || taskDeleting ? 'pointer-events-none opacity-60' : ''}`}>
                        Загрузить
                        <input type="file" className="hidden" multiple onChange={(e) => uploadFile(e.target.files)} disabled={uploading || taskSaving || taskDeleting} />
                      </label>
                      {uploading && (
                        <span className="inline-flex items-center gap-2 text-xs text-[#8a8a8a]">
                          <Loader2 size={14} className="animate-spin" />
                          Загрузка...
                        </span>
                      )}
                    </div>
                    <div className="space-y-1">
                      {task.attachments?.map((a) => (
                        <div key={a.id} className="flex flex-wrap items-center justify-between gap-2 rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-2">
                          <div className="flex min-w-0 items-center gap-3">
                            {isImageFilename(a.filename) && <TaskAttachmentImage id={a.id} filename={a.filename} />}
                            <button
                              type="button"
                              className="min-w-0 break-all text-left text-sm text-[#3a3a3a] underline"
                              onClick={() => downloadAttachment(a.id, a.filename)}
                            >
                              {a.filename}
                            </button>
                          </div>
                          {(isAdmin || a.uploadedById === user?.id) && (
                            <button
                              type="button"
                              className="btn h-8 w-8 border-[#efc1c1] p-0 text-[#b23b3b]"
                              onClick={() => deleteAttachment(a.id, a.filename)}
                              disabled={deletingAttachmentId === a.id || taskSaving || taskDeleting}
                              title="Удалить вложение"
                            >
                              {deletingAttachmentId === a.id ? <Loader2 size={14} className="mx-auto animate-spin" /> : <Trash2 size={14} className="mx-auto" />}
                            </button>
                          )}
                        </div>
                      ))}
                      {(!task.attachments || task.attachments.length === 0) && (
                        <p className="text-sm text-[#8a8a8a]">Файлы не прикреплены</p>
                      )}
                    </div>
                  </div>}
                </div>
              </div>
            </div>

            <div className="space-y-4">
              {isRequesterView ? (
                <div className="rounded-[12px] border border-[#e3e3e3] bg-white p-4">
                  <p className="text-sm font-semibold text-[#1f1f1f]">О заявке</p>
                  <div className="mt-4 space-y-4 text-sm">
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Ответственный специалист</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">
                        {task.assignees?.map((assignee) => assignee.user.name).join(', ') || 'Назначается'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Создана</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{formatRuDateTime(task.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Последнее обновление</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{formatRuDateTime(task.updatedAt)}</p>
                    </div>
                  </div>

                  <details className="mt-4 border-t border-[#ededed] pt-3">
                    <summary className="cursor-pointer text-sm font-medium text-[#5a5a5a]">Дополнительные сведения</summary>
                    <div className="mt-3 space-y-2 text-xs text-[#6f6f6f]">
                      <p>Направление: <span className="font-medium text-[#303030]">{task.folder?.name || 'не указано'}</span></p>
                      <p>Тип: <span className="font-medium text-[#303030]">{[task.type?.name, task.subtype?.name].filter(Boolean).join(' / ') || 'не указан'}</span></p>
                      <p>Категория: <span className="font-medium text-[#303030]">{task.entity?.name || 'не указана'}</span></p>
                      <p>Приоритет: <span className="font-medium text-[#303030]">{priorityLabels[task.priority] || task.priority}</span></p>
                    </div>
                  </details>

                  <div className="mt-4 rounded-[10px] bg-[#f6f6f6] px-3 py-3 text-xs leading-5 text-[#686868]">
                    О новых сообщениях и изменениях статуса вы узнаете в разделе уведомлений.
                  </div>
                </div>
              ) : (
              <div className="rounded-[12px] border border-[#e3e3e3] bg-white p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.08em] text-[#7a7a7a]">Свойства заявки</p>
                <div className="mt-3 space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Статус</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{getStatusLabel(task.status)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Приоритет</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{priorityLabels[task.priority] || task.priority}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Папка</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{task.folder?.name || 'Не указана'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Канал</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">
                        {(task.channel || task.sourceChannel)
                          ? (String(task.channel || task.sourceChannel).toUpperCase() === 'EMAIL' ? 'Email' : 'Web')
                          : 'Не указан'}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Тип</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{task.type?.name || 'Не указан'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Подтип</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{task.subtype?.name || 'Не указан'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Заявщик</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{task.author?.name || 'Не указан'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Исполнитель</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{task.assignees?.map((assignee) => assignee.user.name).join(', ') || 'Не назначен'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Сущность</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{task.entity?.name || 'Не указана'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Внешний номер</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{task.externalNumber || task.externalId || 'Не указан'}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Создана</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{formatRuDateTime(task.createdAt)}</p>
                    </div>
                    <div>
                      <p className="text-xs text-[#8a8a8a]">Обновлена</p>
                      <p className="mt-1 font-medium text-[#1f1f1f]">{formatRuDateTime(task.updatedAt)}</p>
                    </div>
                  </div>
                </div>
              </div>
              )}

            </div>
          </div>

          {!isRequesterView && <div className="rounded-[12px] border border-dashed border-[#d7d7d7] bg-[#fcfcfc] p-4 space-y-3 xl:hidden">
            <p className="mb-1 text-xs font-semibold uppercase tracking-[0.08em] text-[#7a7a7a]">Управление статусом</p>
            <div className="flex gap-2 items-center text-sm">
              <span className="text-[#606060]">Статус:</span>
              {canUpdateStatus ? (
                statusActionOptions.length > 0 ? (
                  statusActionOptions.map((option) => (
                    <button
                      key={option.value}
                      className="px-2 py-1 rounded-[10px] border text-xs transition-colors bg-white text-[#5a5a5a] border-[#dedede]"
                      disabled={statusUpdating || taskSaving || taskDeleting}
                      onClick={() => changeStatus(option.value as TaskStatus)}
                      data-testid={`task-status-action-${option.value}`}
                    >
                      {option.label}
                    </button>
                  ))
                ) : (
                  <span className="chip">Нет доступных переходов</span>
                )
              ) : (
                <span className="chip">Только просмотр</span>
              )}
            </div>
          </div>}

          {isAdmin && (
            <div className="rounded-[12px] border border-dashed border-[#d7d7d7] bg-[#fcfcfc] p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-[#1f1f1f]">Админ-управление заявкой</p>
                <p className="mt-1 text-xs text-[#8a8a8a]">Используйте этот блок только если нужно исправить данные или удалить заявку.</p>
              </div>

              <input
                className="input"
                placeholder="Название заявки"
                value={titleDraft}
                onChange={(event) => setTitleDraft(event.target.value)}
                disabled={taskSaving || taskDeleting}
              />

              <textarea
                className="input min-h-[96px]"
                rows={3}
                placeholder="Описание"
                value={descriptionDraft}
                onChange={(event) => setDescriptionDraft(event.target.value)}
                disabled={taskSaving || taskDeleting}
              />

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Приоритет</label>
                  <select
                    className="input w-full"
                    value={priorityDraft}
                    onChange={(event) => setPriorityDraft(event.target.value as TaskPriority)}
                    disabled={taskSaving || taskDeleting}
                  >
                    {Object.entries(priorityLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Дедлайн</label>
                  <input
                    type="date"
                    className="input w-full"
                    value={dueDateDraft}
                    onChange={(event) => setDueDateDraft(event.target.value)}
                    disabled={taskSaving || taskDeleting}
                  />
                </div>

                {mergedDepartmentOptions.length > 0 && (
                  <div>
                    <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Папка</label>
                    <select
                      className="input w-full"
                      value={folderIdDraft}
                      onChange={(event) => setFolderIdDraft(event.target.value)}
                      disabled={taskSaving || taskDeleting}
                    >
                      <option value="">Не указан</option>
                      {mergedDepartmentOptions.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="mb-2 block text-sm font-medium text-[#4a4a4a]">Исполнители</label>
                  <select
                    multiple
                    className="input h-24 w-full"
                    value={assigneeIdsDraft}
                    onChange={(event) => {
                      const selectedIds = Array.from(event.target.selectedOptions).map((option) => option.value);
                      setAssigneeIdsDraft(selectedIds);
                    }}
                    disabled={taskSaving || taskDeleting}
                  >
                    {assignableEditableUsers.map((editableUser) => (
                      <option key={editableUser.id} value={editableUser.id}>
                        {editableUser.name} · {getRoleLabel(editableUser.role)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="flex items-start gap-2 rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-2 text-sm text-[#4a4a4a]">
                <input
                  type="checkbox"
                  className="mt-1"
                  checked={requesterCloseRequiredDraft}
                  onChange={(event) => setRequesterCloseRequiredDraft(event.target.checked)}
                  disabled={taskSaving || taskDeleting}
                />
                <span>
                  Нельзя закрыть без подтверждения заявителя
                  <span className="mt-1 block text-xs text-[#8a8a8a]">
                    После изменения настройки текущее подтверждение сбрасывается.
                  </span>
                </span>
              </label>

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e6e6e6] pt-3">
                <button
                  type="button"
                  className="btn border-[#efc1c1] text-[#b23b3b] hover:bg-[#fff4f4]"
                  onClick={deleteTask}
                  disabled={taskDeleting || taskSaving}
                >
                  {taskDeleting ? 'Удаляем...' : 'Удалить'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={saveTask}
                  disabled={taskSaving || taskDeleting}
                >
                  {taskSaving ? 'Сохраняем...' : 'Сохранить'}
                </button>
              </div>
            </div>
          )}
        </div>
      ) : error ? (
        <div className="py-6 text-center text-red-500">{error}</div>
      ) : null}
    </Modal>
    <Modal open={mergeModalOpen} onClose={() => !mergeSaving && setMergeModalOpen(false)} title="Объединить заявки">
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-[#5f5f5f]">Режим объединения</label>
          <select
            className="input"
            value={mergeMode}
            onChange={(event) => setMergeMode(event.target.value as TaskMergeMode)}
            disabled={mergeSaving}
          >
            <option value="LINK">{mergeModeLabels.LINK}</option>
            <option value="UNION">{mergeModeLabels.UNION}</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm text-[#5f5f5f]">Заявки для объединения *</label>
          {mergeCandidateTasks.length === 0 ? (
            <div className="rounded-[10px] border border-dashed border-[#dddddd] bg-[#fcfcfc] px-3 py-4 text-sm text-[#6b6b6b]">
              Нет доступных заявок для выбора.
            </div>
          ) : (
            <select
              multiple
              className="input h-40"
              value={mergeTaskIds}
              onChange={(event) => setMergeTaskIds(Array.from(event.target.selectedOptions).map((option) => option.value))}
              disabled={mergeSaving}
            >
              {mergeCandidateTasks.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {[getTaskDisplayNumber(candidate), candidate.title, candidate.status ? getStatusLabel(candidate.status) : candidate.id].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          )}
          <p className="mt-1 text-xs text-[#8a8a8a]">Можно выбрать одну или несколько заявок.</p>
        </div>

        <div>
          <label className="mb-1 block text-sm text-[#5f5f5f]">Причина *</label>
          <textarea
            className="input min-h-[96px]"
            value={mergeReason}
            onChange={(event) => setMergeReason(event.target.value)}
            placeholder="Почему эти заявки нужно объединить"
            disabled={mergeSaving}
          />
        </div>

        {mergeFormError && <p className="text-sm text-[#b23b3b]">{mergeFormError}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" className="btn" disabled={mergeSaving} onClick={() => setMergeModalOpen(false)}>
            Отмена
          </button>
          <button type="button" className="btn btn-primary" disabled={mergeSaving || mergeTaskIds.length === 0 || !mergeReason.trim()} onClick={mergeTasks}>
            {mergeSaving ? 'Объединяем...' : 'Объединить'}
          </button>
        </div>
      </div>
    </Modal>
    </>
  );
};
