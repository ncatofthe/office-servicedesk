import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Filter, Plus, Search, SlidersHorizontal, X } from 'lucide-react';
import {
  filesApi,
  serviceDeskFoldersApi,
  tasksApi,
  ticketEntitiesApi,
  ticketSubtypesApi,
  ticketTypesApi,
} from '../api';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useProductSettings } from '../contexts/ProductSettingsContext';
import { useAppStore } from '../store/useAppStore';
import type {
  CreateTaskRequest,
  ServiceDeskEntity,
  ServiceDeskFolder,
  ServiceDeskTicketSubtype,
  ServiceDeskTicketType,
  TaskPriority,
  TaskStatus,
  TaskSummary,
  TasksQuery,
} from '../types';
import { canCreateTasks, hasCapability } from '../access';
import { TaskDetailsModal } from '../components/TaskDetailsModal';
import { DataState } from '../components/ui/DataState';
import { AssigneeCheckboxList } from '../components/ui/AssigneeCheckboxList';
import { TASK_STATUS_OPTIONS, formatDateTime, getAvailableTaskStatusOptions, getStatusColor, getStatusLabel, isAssignableRole, priorityLabels } from '../utils';
import type { TaskDepartmentOption } from '../utils/task-departments';
import { useSearchParams } from 'react-router-dom';

type QuickScope = 'all' | 'mine';
type SortKey = 'updated' | 'created' | 'priority';
type UpdateWindow = 'all' | '24h' | '7d' | '30d';

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== 'object' || error === null) {
    return fallback;
  }

  const response = (error as {
    response?: {
      data?: {
        error?: string;
        message?: string;
        errors?: Array<{ msg?: string; message?: string }>;
      };
    };
  }).response;
  const firstValidationError = response?.data?.errors?.[0];
  return response?.data?.error
    || response?.data?.message
    || firstValidationError?.msg
    || firstValidationError?.message
    || fallback;
};

const toDepartmentOptions = (folders: ServiceDeskFolder[]): TaskDepartmentOption[] =>
  folders
    .filter((folder) => folder.isActive !== false)
    .map((folder) => ({
      id: folder.id,
      name: folder.name,
      isPrimary: false,
    }));

const getTaskTags = (task: unknown): string[] => {
  const tags = (task as { tags?: unknown }).tags;
  return Array.isArray(tags) ? tags.filter((tag): tag is string => typeof tag === 'string') : [];
};

const getTaskChannel = (task: TaskSummary) => {
  const rawChannel = task.channel || task.sourceChannel;
  if (!rawChannel) {
    return '';
  }

  const normalizedChannel = String(rawChannel).toUpperCase();
  if (normalizedChannel === 'EMAIL') {
    return 'EMAIL';
  }

  return 'WEB';
};

const channelLabel = (channel: string) => {
  if (channel === 'EMAIL') {
    return 'Email';
  }

  return channel === 'WEB' ? 'Web' : 'Не указан';
};

const priorityRank: Record<string, number> = {
  URGENT: 0,
  HIGH: 1,
  MEDIUM: 2,
  LOW: 3,
};

const getTaskDisplayNumber = (task: TaskSummary) =>
  task.displayNumber || (typeof task.ticketNumber === 'number' ? `#${task.ticketNumber}` : task.id.slice(0, 8));

const getExternalReference = (task: TaskSummary) =>
  task.externalNumber || task.externalId || '';

const getActionErrorMessage = (error: unknown, fallback: string) => {
  const response = (error as { response?: { status?: number } })?.response;
  const apiMessage = getApiErrorMessage(error, '');

  if (response?.status === 403) {
    const normalizedMessage = apiMessage.trim().toLowerCase();
    if (!apiMessage || normalizedMessage === 'access denied' || normalizedMessage === 'forbidden') {
      return 'Недостаточно прав для этого действия. Обновите список или обратитесь к администратору.';
    }
    return apiMessage;
  }
  if (response?.status === 404) {
    return 'Заявка больше недоступна. Обновите список и попробуйте снова.';
  }
  if (response?.status === 409) {
    return apiMessage || 'Действие не выполнено: заявка уже была изменена другим пользователем.';
  }
  if (response?.status === 429) {
    return 'Слишком много запросов. Подождите несколько секунд и повторите действие.';
  }

  return fallback;
};

const sortTasks = (tasks: TaskSummary[], sortBy: SortKey) => {
  const copy = [...tasks];

  if (sortBy === 'priority') {
    return copy.sort((left, right) => {
      const leftRank = priorityRank[left.priority] ?? 99;
      const rightRank = priorityRank[right.priority] ?? 99;
      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    });
  }

  const dateField = sortBy === 'created' ? 'createdAt' : 'updatedAt';
  return copy.sort((left, right) => new Date(right[dateField]).getTime() - new Date(left[dateField]).getTime());
};

export const TasksPage: React.FC = () => {
  const { user } = useAuth();
  const { settings, isFeatureEnabled } = useProductSettings();
  const [searchParams, setSearchParams] = useSearchParams();
  const {
    tasks,
    tasksTotal,
    users,
    loadingTasks,
    tasksError,
    usersError,
    fetchTasks,
    fetchUsers,
    createTask,
    moveTask,
  } = useAppStore();
  const canCreateTicket = canCreateTasks(user?.role) && isFeatureEnabled('ticketCreation');
  const canReadUsers = hasCapability(user, 'users:read');
  const canUseAssigneeScope = user?.role === 'ADMIN' || user?.role === 'AGENT';
  const isRequester = user?.role === 'REQUESTER';
  const [folders, setFolders] = useState<ServiceDeskFolder[]>([]);
  const [ticketTypes, setTicketTypes] = useState<ServiceDeskTicketType[]>([]);
  const [ticketSubtypes, setTicketSubtypes] = useState<ServiceDeskTicketSubtype[]>([]);
  const [entities, setEntities] = useState<ServiceDeskEntity[]>([]);
  const [dictionaryWarning, setDictionaryWarning] = useState('');
  const [scope, setScope] = useState<QuickScope>('all');
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => {
    const requestedStatus = searchParams.get('status');
    return TASK_STATUS_OPTIONS.some((option) => option.value === requestedStatus)
      ? requestedStatus || ''
      : '';
  });
  const [priorityFilter, setPriorityFilter] = useState('');
  const [folderFilter, setFolderFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [subtypeFilter, setSubtypeFilter] = useState('');
  const [entityFilter, setEntityFilter] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [tagFilter, setTagFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [updatedWindow, setUpdatedWindow] = useState<UpdateWindow>('all');
  const [sortBy, setSortBy] = useState<SortKey>('updated');
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority | ''>('');
  const [folderId, setFolderId] = useState('');
  const [typeId, setTypeId] = useState('');
  const [subtypeId, setSubtypeId] = useState('');
  const [entityId, setEntityId] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [showCreateDetails, setShowCreateDetails] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [creationWarning, setCreationWarning] = useState('');
  const [actionError, setActionError] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [rowActionId, setRowActionId] = useState('');
  const [pageSize, setPageSize] = useState(25);
  const [pageIndex, setPageIndex] = useState(0);

  const departmentOptions = useMemo(() => toDepartmentOptions(folders), [folders]);
  const assignableUsers = useMemo(
    () => (canReadUsers ? users.filter((teamUser) => isAssignableRole(teamUser.role)) : []),
    [canReadUsers, users]
  );
  const filteredTypeOptions = useMemo(
    () => ticketTypes.filter((type) => !folderId || !type.folderId || type.folderId === folderId),
    [folderId, ticketTypes]
  );
  const filteredSubtypeOptions = useMemo(
    () => ticketSubtypes.filter((subtype) => !typeId || !subtype.typeId || subtype.typeId === typeId),
    [ticketSubtypes, typeId]
  );
  const typeFilterOptions = useMemo(
    () => ticketTypes.filter((type) => !folderFilter || !type.folderId || type.folderId === folderFilter),
    [folderFilter, ticketTypes]
  );
  const subtypeFilterOptions = useMemo(
    () => ticketSubtypes.filter((subtype) => !typeFilter || !subtype.typeId || subtype.typeId === typeFilter),
    [ticketSubtypes, typeFilter]
  );
  const hasAdvancedFilters = Boolean(
    search ||
    statusFilter ||
    priorityFilter ||
    folderFilter ||
    typeFilter ||
    subtypeFilter ||
    entityFilter ||
    assigneeFilter ||
    tagFilter ||
    channelFilter ||
    updatedWindow !== 'all'
  );
  const hasExtraFilters = Boolean(
    typeFilter ||
    subtypeFilter ||
    entityFilter ||
    assigneeFilter ||
    tagFilter ||
    channelFilter ||
    updatedWindow !== 'all' ||
    sortBy !== 'updated'
  );

  const requiresFullDataset = Boolean(
    tagFilter.trim() || sortBy === 'priority'
  );

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    setPageIndex(0);
  }, [
    assigneeFilter,
    channelFilter,
    debouncedSearch,
    entityFilter,
    folderFilter,
    pageSize,
    priorityFilter,
    scope,
    sortBy,
    statusFilter,
    subtypeFilter,
    tagFilter,
    typeFilter,
    updatedWindow,
  ]);

  const refreshInbox = useCallback(async () => {
    const params: TasksQuery = {
      limit: pageSize,
      offset: requiresFullDataset ? 0 : pageIndex * pageSize,
    };
    if (debouncedSearch) params.search = debouncedSearch;
    if (statusFilter) params.status = statusFilter as TaskStatus;
    if (priorityFilter) params.priority = priorityFilter as TaskPriority;
    if (folderFilter) params.folderId = folderFilter;
    if (typeFilter) params.typeId = typeFilter;
    if (subtypeFilter) params.subtypeId = subtypeFilter;
    if (entityFilter) params.entityId = entityFilter;
    if (assigneeFilter) params.assigneeId = assigneeFilter;
    if (scope === 'mine') params.scope = 'mine';
    if (channelFilter) params.channel = channelFilter as 'WEB' | 'EMAIL';
    if (updatedWindow !== 'all') {
      const maxAge = updatedWindow === '24h'
        ? 24 * 60 * 60 * 1000
        : updatedWindow === '7d'
          ? 7 * 24 * 60 * 60 * 1000
          : 30 * 24 * 60 * 60 * 1000;
      params.updatedAfter = new Date(Date.now() - maxAge).toISOString();
    }
    params.sortBy = sortBy === 'priority' ? 'updated' : sortBy;
    params.sortOrder = 'desc';
    await fetchTasks(params, { loadAll: requiresFullDataset });
  }, [
    assigneeFilter,
    channelFilter,
    debouncedSearch,
    entityFilter,
    fetchTasks,
    folderFilter,
    pageIndex,
    pageSize,
    priorityFilter,
    requiresFullDataset,
    scope,
    sortBy,
    statusFilter,
    subtypeFilter,
    typeFilter,
    updatedWindow,
  ]);

  useEffect(() => {
    void refreshInbox();
  }, [refreshInbox]);

  useEffect(() => {
    if (canReadUsers) {
      fetchUsers();
    }
  }, [canReadUsers, fetchUsers]);

  useEffect(() => {
    if (!canUseAssigneeScope) {
      setScope('all');
      setAssigneeFilter('');
      setAssignees([]);
    }
  }, [canUseAssigneeScope]);

  useEffect(() => {
    const assignableIds = new Set(assignableUsers.map((teamUser) => teamUser.id));
    setAssignees((current) => current.filter((assigneeId) => assignableIds.has(assigneeId)));
    if (assigneeFilter && !assignableIds.has(assigneeFilter)) {
      setAssigneeFilter('');
    }
  }, [assignableUsers, assigneeFilter]);

  useEffect(() => {
    let isActive = true;

    Promise.allSettled([
      serviceDeskFoldersApi.getAll({ adminFallback: user?.role === 'ADMIN' }),
      ticketTypesApi.getAll({ adminFallback: user?.role === 'ADMIN' }),
      ticketSubtypesApi.getAll({ adminFallback: user?.role === 'ADMIN' }),
      ticketEntitiesApi.getAll({ adminFallback: user?.role === 'ADMIN' }),
    ]).then(([foldersResult, typesResult, subtypesResult, entitiesResult]) => {
      if (!isActive) {
        return;
      }

      setFolders(foldersResult.status === 'fulfilled' ? foldersResult.value : []);
      setTicketTypes(typesResult.status === 'fulfilled' ? typesResult.value : []);
      setTicketSubtypes(subtypesResult.status === 'fulfilled' ? subtypesResult.value : []);
      setEntities(entitiesResult.status === 'fulfilled' ? entitiesResult.value : []);

      const failedCount = [foldersResult, typesResult, subtypesResult, entitiesResult].filter((result) => result.status === 'rejected').length;
      setDictionaryWarning(failedCount > 0 ? 'Часть справочников пока недоступна на backend. Недоступные списки показаны пустыми.' : '');
    });

    return () => {
      isActive = false;
    };
  }, [user?.role]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      if (canCreateTicket) {
        const accessibleDefaultFolderId = settings?.defaultFolderId
          && folders.some((folder) => folder.id === settings.defaultFolderId && folder.isActive !== false)
          ? settings.defaultFolderId
          : '';
        setPriority(settings?.defaultPriority || '');
        setFolderId(accessibleDefaultFolderId);
        setOpen(true);
      }

      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete('create');
      setSearchParams(nextSearchParams, { replace: true });
      return;
    }

    const taskId = searchParams.get('taskId');
    if (taskId) {
      setSelectedTaskId(taskId);
      const nextSearchParams = new URLSearchParams(searchParams);
      nextSearchParams.delete('taskId');
      setSearchParams(nextSearchParams, { replace: true });
    }
  }, [canCreateTicket, folders, searchParams, setSearchParams, settings?.defaultFolderId, settings?.defaultPriority]);

  const filteredTasks = useMemo(() => {
    const items = tasks.filter((task) => {
      if (tagFilter.trim()) {
        const tagNeedle = tagFilter.trim().toLowerCase();
        return getTaskTags(task).some((tag) => tag.toLowerCase().includes(tagNeedle));
      }

      return true;
    });

    return sortBy === 'priority' ? sortTasks(items, sortBy) : items;
  }, [sortBy, tagFilter, tasks]);

  const visibleTasks = useMemo(
    () => requiresFullDataset
      ? filteredTasks.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize)
      : filteredTasks,
    [filteredTasks, pageIndex, pageSize, requiresFullDataset]
  );
  const filteredTotal = requiresFullDataset ? filteredTasks.length : tasksTotal;
  const pageCount = Math.max(1, Math.ceil(filteredTotal / pageSize));
  const rangeStart = filteredTotal === 0 ? 0 : pageIndex * pageSize + 1;
  const rangeEnd = Math.min((pageIndex + 1) * pageSize, filteredTotal);

  useEffect(() => {
    if (pageIndex >= pageCount) {
      setPageIndex(Math.max(0, pageCount - 1));
    }
  }, [pageCount, pageIndex]);

  const emptyMessage = hasAdvancedFilters || scope === 'mine'
    ? 'По выбранным условиям заявок не найдено.'
    : canCreateTicket
      ? 'Пока нет заявок. Создайте первую заявку, чтобы начать работу.'
      : 'Пока нет заявок для отображения.';

  const inboxStats = useMemo(() => ({
    total: filteredTotal,
    newCount: visibleTasks.filter((task) => task.status === 'NEW').length,
    inProgressCount: visibleTasks.filter((task) => getStatusLabel(task.status) === 'В процессе').length,
    completedCount: visibleTasks.filter((task) => task.status === 'DONE').length,
    mineCount: user ? visibleTasks.filter((task) => task.assignees?.some((assignee) => assignee.userId === user.id)).length : 0,
  }), [filteredTotal, user, visibleTasks]);

  const resetForm = () => {
    const accessibleDefaultFolderId = settings?.defaultFolderId
      && folders.some((folder) => folder.id === settings.defaultFolderId && folder.isActive !== false)
      ? settings.defaultFolderId
      : '';
    setTitle('');
    setDescription('');
    setPriority(settings?.defaultPriority || '');
    setFolderId(accessibleDefaultFolderId);
    setTypeId('');
    setSubtypeId('');
    setEntityId('');
    setAssignees([]);
    setFiles([]);
    setShowCreateDetails(false);
    setFormError('');
  };

  const openCreateForm = () => {
    resetForm();
    setOpen(true);
  };

  const handleFiles = (fileList: FileList) => {
    setFiles((current) => {
      const next = [...current];
      for (const file of Array.from(fileList)) {
        const duplicate = next.some((item) => item.name === file.name && item.size === file.size);
        if (!duplicate) {
          next.push(file);
        }
      }
      return next;
    });
  };

  const resetFilters = () => {
    setScope('all');
    setSearch('');
    setStatusFilter('');
    setPriorityFilter('');
    setFolderFilter('');
    setTypeFilter('');
    setSubtypeFilter('');
    setEntityFilter('');
    setAssigneeFilter('');
    setTagFilter('');
    setChannelFilter('');
    setUpdatedWindow('all');
    setSortBy('updated');
    setShowAdvancedFilters(false);
    setActionError('');
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.delete('status');
    setSearchParams(nextSearchParams, { replace: true });
  };

  const updateStatusFilter = (value: string) => {
    setStatusFilter(value);
    const nextSearchParams = new URLSearchParams(searchParams);
    if (value) {
      nextSearchParams.set('status', value);
    } else {
      nextSearchParams.delete('status');
    }
    setSearchParams(nextSearchParams, { replace: true });
  };

  const handleCreate = async () => {
    if (!title.trim()) {
      setFormError('Введите название заявки.');
      return;
    }

    if (!description.trim()) {
      setFormError('Введите описание заявки.');
      return;
    }

    setIsSaving(true);
    setFormError('');
    setSuccessMessage('');
    setCreationWarning('');

    const payload: CreateTaskRequest = {
      title: title.trim(),
      description: description.trim(),
      assigneeIds: assignees,
    };

    if (priority) payload.priority = priority;
    if (folderId) payload.folderId = folderId;
    if (typeId) payload.typeId = typeId;
    if (subtypeId) payload.subtypeId = subtypeId;
    if (entityId) payload.entityId = entityId;

    let task: TaskSummary;
    try {
      task = await createTask(payload);
    } catch (error) {
      console.error('Failed to create ticket', error);
      setFormError(getApiErrorMessage(error, 'Не удалось создать заявку. Проверьте соединение и попробуйте ещё раз.'));
      setIsSaving(false);
      return;
    }

    const filesToUpload = [...files];
    const uploadResults = await Promise.allSettled(
      filesToUpload.map((file) => filesApi.uploadTaskFile(task.id, file))
    );
    const failedFiles = filesToUpload.filter((_, index) => uploadResults[index]?.status === 'rejected');
    const displayNumber = getTaskDisplayNumber(task);

    resetForm();
    setOpen(false);
    setSuccessMessage(`Заявка создана. Номер: ${displayNumber}.`);
    if (failedFiles.length > 0) {
      setCreationWarning(
        `Заявка ${displayNumber} уже сохранена, но не удалось загрузить ${failedFiles.length} файл(ов): ${failedFiles.map((file) => file.name).join(', ')}. Не создавайте заявку повторно.`
      );
    }
    await refreshInbox();
    setIsSaving(false);
  };

  const assignToMe = async (task: TaskSummary) => {
    if (!user?.id) {
      return;
    }

    setRowActionId(`assign-${task.id}`);
    setSuccessMessage('');
    setActionError('');
    try {
      await tasksApi.addAssignee(task.id, user.id);
      await refreshInbox();
      setSuccessMessage(`Вы назначены на ${getTaskDisplayNumber(task)}.`);
    } catch (error) {
      setActionError(getActionErrorMessage(error, `Не удалось назначить вас на ${getTaskDisplayNumber(task)}. Попробуйте ещё раз.`));
    } finally {
      setRowActionId('');
    }
  };

  const moveForward = async (task: TaskSummary, nextStatus: TaskStatus) => {
    setRowActionId(`status-${task.id}`);
    setSuccessMessage('');
    setActionError('');
    try {
      await moveTask(task.id, nextStatus);
      setSuccessMessage(`Статус ${getTaskDisplayNumber(task)} обновлён.`);
    } catch (error) {
      setActionError(getActionErrorMessage(error, `Не удалось изменить статус ${getTaskDisplayNumber(task)}. Обновите список и попробуйте снова.`));
    } finally {
      setRowActionId('');
    }
  };

  const approveCloseFromList = async (task: TaskSummary) => {
    setRowActionId(`status-${task.id}`);
    setSuccessMessage('');
    setActionError('');
    try {
      const response = await tasksApi.confirmClose(task.id);
      await refreshInbox();
      setSuccessMessage(response.closed
        ? `${getTaskDisplayNumber(task)} закрыта после согласования всех исполнителей.`
        : `Ваше согласование закрытия ${getTaskDisplayNumber(task)} сохранено.`);
    } catch (error) {
      setActionError(getActionErrorMessage(error, `Не удалось согласовать закрытие ${getTaskDisplayNumber(task)}.`));
    } finally {
      setRowActionId('');
    }
  };

  const isMyTask = (task: TaskSummary) => Boolean(user && task.assignees?.some((assignee) => assignee.userId === user.id));

  const renderRowAction = (task: TaskSummary) => {
    if (isRequester) {
      return (
        <button
          type="button"
          className="btn btn-primary w-full sm:w-auto"
          onClick={() => setSelectedTaskId(task.id)}
          data-testid="task-inbox-open"
        >
          Открыть заявку
        </button>
      );
    }

    const taskStatusOptions = getAvailableTaskStatusOptions(task.status, user?.role, {
      isAssignee: isMyTask(task),
      isAuthor: user?.id === task.author.id,
    });
    const preferredStatus: TaskStatus | undefined = task.status === 'NEW'
      ? 'IN_PROGRESS'
      : ['IN_PROGRESS', 'REVIEW', 'REWORK'].includes(task.status)
        ? 'DONE'
        : task.status === 'POSTPONED'
          ? 'IN_PROGRESS'
          : undefined;
    const nextStatus = taskStatusOptions.some((option) => option.value === preferredStatus)
      ? preferredStatus
      : taskStatusOptions[0]?.value;
    const assigneeCount = Math.max(task.assignees?.length || 0, task._count?.assignees || 0);
    const hasAssignees = assigneeCount > 0;
    const requiresCoordinatedClose = nextStatus === 'DONE' && assigneeCount > 1;
    const isAssignedToAnotherAgent = Boolean(user?.role === 'AGENT' && hasAssignees && !isMyTask(task));
    const canAssignSelf = Boolean(user && (user.role === 'ADMIN' || user.role === 'AGENT') && !hasAssignees);

    return (
      <div className="flex flex-wrap items-center justify-end gap-2 xl:flex-col xl:items-stretch xl:justify-start">
        {canAssignSelf && (
          <button
            type="button"
            className="btn xl:w-full"
            onClick={() => void assignToMe(task)}
            disabled={Boolean(rowActionId)}
            data-testid="task-quick-assign"
          >
            {rowActionId === `assign-${task.id}` ? 'Назначаем...' : 'Взять в работу'}
          </button>
        )}
        {nextStatus && (
          <button
            type="button"
            className={`btn xl:w-full ${requiresCoordinatedClose ? 'min-h-11 py-2 text-center leading-4' : ''}`}
            style={requiresCoordinatedClose ? { whiteSpace: 'normal', overflowWrap: 'anywhere' } : undefined}
            onClick={() => void (requiresCoordinatedClose ? approveCloseFromList(task) : moveForward(task, nextStatus))}
            disabled={Boolean(rowActionId)}
            data-testid="task-quick-status"
          >
            {rowActionId === `status-${task.id}`
              ? (requiresCoordinatedClose ? 'Согласовываем...' : 'Обновляем...')
              : nextStatus === 'IN_PROGRESS'
                ? 'Перевести в работу'
                : requiresCoordinatedClose
                  ? 'Согласовать закрытие'
                  : nextStatus === 'DONE'
                    ? 'Закрыть'
                    : `Статус: ${getStatusLabel(nextStatus)}`}
          </button>
        )}
        {isAssignedToAnotherAgent && (
          <span className="text-center text-xs leading-4 text-[#8a8a8a]">Закреплена за другим исполнителем</span>
        )}
        <button type="button" className="btn btn-primary xl:w-full" onClick={() => setSelectedTaskId(task.id)} data-testid="task-inbox-open">
          Открыть
        </button>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="page-title">{isRequester ? 'Мои заявки' : 'Заявки'}</h1>
          <p className="page-subtitle mt-1">
            {isRequester
              ? 'Здесь можно проверить статус, открыть переписку или создать новое обращение.'
              : 'Основной рабочий список для обработки обращений по web и email.'}
          </p>
        </div>
        {canCreateTicket && (
          <button className="btn btn-primary inline-flex items-center gap-2" onClick={openCreateForm} data-testid="open-create-ticket">
            <Plus size={16} />
            Создать заявку
          </button>
        )}
      </div>

      {successMessage && (
        <div className="rounded-[12px] border border-[#b8e4c6] bg-[#eef9f2] px-4 py-3 text-sm text-[#1f7a42]" data-testid="ticket-create-success">
          {successMessage}
        </div>
      )}

      {creationWarning && (
        <div className="rounded-[12px] border border-[#efd49c] bg-[#fff8e8] px-4 py-3 text-sm text-[#825510]" data-testid="ticket-create-partial-success">
          {creationWarning}
        </div>
      )}

      {actionError && (
        <div className="rounded-[12px] border border-[#efc1c1] bg-[#fff3f3] px-4 py-3 text-sm text-[#a12f2f]" role="alert" data-testid="task-action-error">
          {actionError}
        </div>
      )}

      {dictionaryWarning && (
        <div className="rounded-[12px] border border-[#f0dcb8] bg-[#fffaf0] px-4 py-3 text-sm text-[#8a5b12]">
          {dictionaryWarning}
        </div>
      )}

      <div className={`grid grid-cols-1 gap-3 sm:grid-cols-3 ${isRequester ? '' : 'lg:grid-cols-4'}`}>
        {(isRequester
          ? [
              ['Всего заявок', inboxStats.total],
              ['Ожидают обработки', inboxStats.newCount],
              ['Решено на странице', inboxStats.completedCount],
            ]
          : [
              ['Всего найдено', inboxStats.total],
              ['Необработано на странице', inboxStats.newCount],
              ['В работе на странице', inboxStats.inProgressCount],
              ['Мне на этой странице', inboxStats.mineCount],
            ]
        ).map(([label, value]) => (
          <div key={String(label)} className="rounded-[12px] border border-[#e3e3e3] bg-white px-4 py-3">
            <p className="text-xs text-[#8a8a8a]">{label}</p>
            <p className="mt-1 text-lg font-semibold text-[#1f1f1f]">{value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-3 rounded-[14px] border border-[#e3e3e3] bg-white p-4 shadow-[0_8px_24px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="inline-flex items-center gap-2 text-sm font-semibold text-[#1f1f1f]">
              <Filter size={16} />
              {isRequester ? 'Найти заявку' : 'Фильтры заявок'}
            </div>
            <p className="mt-1 text-xs text-[#8a8a8a]">
              {isRequester ? 'Можно искать по номеру, теме или отфильтровать по статусу.' : 'Для обычной работы достаточно поиска, статуса, папки и приоритета.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canUseAssigneeScope && (
              <div className="flex flex-wrap gap-2">
                <button className={`btn ${scope === 'all' ? 'btn-primary' : ''}`} onClick={() => setScope('all')}>
                  Все доступные
                </button>
                <button className={`btn ${scope === 'mine' ? 'btn-primary' : ''}`} onClick={() => setScope('mine')}>
                  Только мои
                </button>
              </div>
            )}
            <button className="btn" onClick={resetFilters}>
              Сбросить
            </button>
          </div>
        </div>

        <div className={`grid grid-cols-1 gap-3 md:grid-cols-2 ${isRequester ? '' : 'xl:grid-cols-4'}`}>
          <label className={`relative ${isRequester ? '' : 'xl:col-span-2'}`}>
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8a8a8a]" />
            <input
              className="input pl-9"
              placeholder="Поиск по номеру, теме, описанию или заявителю"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              data-testid="ticket-search"
            />
          </label>

          <select className="input" value={statusFilter} onChange={(event) => updateStatusFilter(event.target.value)}>
            <option value="">Все статусы</option>
            {TASK_STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>

          {!isRequester && <select className="input" value={folderFilter} onChange={(event) => {
            setFolderFilter(event.target.value);
            setTypeFilter('');
            setSubtypeFilter('');
          }}>
            <option value="">Все папки</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>{folder.name}</option>
            ))}
          </select>}

          {!isRequester && <select className="input" value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
            <option value="">Все приоритеты</option>
            {Object.entries(priorityLabels).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>}
        </div>

        {!isRequester && <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn inline-flex items-center gap-2"
            onClick={() => setShowAdvancedFilters((value) => !value)}
            aria-expanded={showAdvancedFilters || hasExtraFilters}
          >
            <SlidersHorizontal size={15} />
            Дополнительные фильтры
            {hasExtraFilters && <span className="rounded-full bg-[#2f2f2f] px-2 py-0.5 text-[11px] text-white">активны</span>}
            <ChevronDown size={15} className={`transition-transform ${(showAdvancedFilters || hasExtraFilters) ? 'rotate-180' : ''}`} />
          </button>
          {!canUseAssigneeScope && (
            <span className="text-xs text-[#8a8a8a]">Вы видите только свои заявки.</span>
          )}
        </div>}

        {!isRequester && (showAdvancedFilters || hasExtraFilters) && (
          <div className="rounded-[12px] border border-[#ececec] bg-[#fbfbfb] p-3">
            <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-[#1f1f1f]">Дополнительные фильтры</p>
                <p className="mt-1 text-xs text-[#8a8a8a]">Нужны для точного поиска по типу, каналу, тегу или исполнителю.</p>
              </div>
              {hasExtraFilters ? (
                <span className="rounded-full bg-white px-3 py-2 text-xs text-[#6f6f6f] shadow-sm">
                  Блок открыт, пока активен хотя бы один расширенный фильтр.
                </span>
              ) : (
                <button type="button" className="btn" onClick={() => setShowAdvancedFilters(false)}>
                  Свернуть
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <select className="input" value={typeFilter} onChange={(event) => {
                setTypeFilter(event.target.value);
                setSubtypeFilter('');
              }}>
                <option value="">Все типы</option>
                {typeFilterOptions.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>

              <select className="input" value={subtypeFilter} onChange={(event) => setSubtypeFilter(event.target.value)}>
                <option value="">Все подтипы</option>
                {subtypeFilterOptions.map((subtype) => (
                  <option key={subtype.id} value={subtype.id}>{subtype.name}</option>
                ))}
              </select>

              <select className="input" value={entityFilter} onChange={(event) => setEntityFilter(event.target.value)}>
                <option value="">Все категории</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>{entity.name}</option>
                ))}
              </select>

              {canReadUsers && (
                <select className="input" value={assigneeFilter} onChange={(event) => setAssigneeFilter(event.target.value)}>
                  <option value="">Все исполнители</option>
                  {assignableUsers.map((teamUser) => (
                    <option key={teamUser.id} value={teamUser.id}>{teamUser.name}</option>
                  ))}
                </select>
              )}

              <select className="input" value={channelFilter} onChange={(event) => setChannelFilter(event.target.value)}>
                <option value="">Все каналы</option>
                <option value="WEB">Web</option>
                <option value="EMAIL">Email</option>
              </select>

              <select className="input" value={updatedWindow} onChange={(event) => setUpdatedWindow(event.target.value as UpdateWindow)}>
                <option value="all">Любое обновление</option>
                <option value="24h">За 24 часа</option>
                <option value="7d">За 7 дней</option>
                <option value="30d">За 30 дней</option>
              </select>

              <select className="input" value={sortBy} onChange={(event) => setSortBy(event.target.value as SortKey)}>
                <option value="updated">Сначала последние обновления</option>
                <option value="created">Сначала новые заявки</option>
                <option value="priority">Сначала высокий приоритет</option>
              </select>

              <input
                className="input"
                placeholder="Тег"
                value={tagFilter}
                onChange={(event) => setTagFilter(event.target.value)}
              />
            </div>
          </div>
        )}

        {canReadUsers && usersError && <p className="text-xs text-[#b23b3b]">Исполнители недоступны: {usersError}</p>}
      </div>

      {loadingTasks ? (
        <DataState variant="loading" message="Загружаем заявки..." />
      ) : tasksError ? (
        <DataState variant="error" message={tasksError} />
      ) : visibleTasks.length === 0 ? (
        <DataState variant="empty" message={emptyMessage} />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-[#e3e3e3] bg-white">
          <div className="overflow-x-auto" data-testid="task-inbox-table">
            <div className={`${isRequester ? 'hidden' : 'hidden xl:grid'} min-w-[1320px] grid-cols-[80px_minmax(200px,1.35fr)_110px_110px_120px_105px_90px_110px_112px_70px_164px] gap-2 border-b border-[#ececec] bg-[#f8f8f8] px-4 py-3 text-xs font-semibold uppercase tracking-[0.04em] text-[#7a7a7a]`}>
            <span>Номер</span>
            <span>Тема</span>
            <span>Заявщик</span>
            <span>Папка</span>
            <span>Тип</span>
            <span>Статус</span>
            <span>Приоритет</span>
            <span>Исполнитель</span>
            <span>Обновлено</span>
            <span>Канал</span>
            <span>Действия</span>
            </div>

            <div className="divide-y divide-[#ececec]">
            {visibleTasks.map((task) => {
              const primaryAssignee = task.assignees?.[0]?.user?.name || 'Не назначен';
              const typeSummary = [task.type?.name, task.subtype?.name].filter(Boolean).join(' / ') || 'Не указан';
              const displayNumber = getTaskDisplayNumber(task);
              const externalReference = getExternalReference(task);
              const taskChannel = getTaskChannel(task);

              return (
                <div
                  key={task.id}
                  className={`grid gap-3 px-4 py-4 ${isRequester ? '' : 'xl:min-w-[1320px] xl:grid-cols-[80px_minmax(200px,1.35fr)_110px_110px_120px_105px_90px_110px_112px_70px_164px] xl:gap-2'}`}
                  data-testid="task-inbox-row"
                >
                  <div className={isRequester ? '' : 'xl:hidden'}>
                    <button
                      type="button"
                      className="flex w-full items-start justify-between gap-3 text-left"
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <div>
                        <p className="text-sm font-semibold text-[#1f1f1f]">{displayNumber}</p>
                        {externalReference && <p className="mt-1 text-xs text-[#8a8a8a]">Freshdesk: {externalReference}</p>}
                        <p className="mt-1 text-sm text-[#4f4f4f]">{task.title}</p>
                      </div>
                      <span className={`rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusColor(task.status)}`}>
                        {getStatusLabel(task.status)}
                      </span>
                    </button>
                    {isRequester ? (
                      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 text-xs text-[#6a6a6a]">
                        <p>Обновлено: <span className="text-[#1f1f1f]">{formatDateTime(task.updatedAt)}</span></p>
                        <p>Специалист: <span className="text-[#1f1f1f]">{primaryAssignee}</span></p>
                      </div>
                    ) : (
                      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-[#6a6a6a]">
                        <p>Заявщик: <span className="text-[#1f1f1f]">{task.author.name}</span></p>
                        <p>Папка: <span className="text-[#1f1f1f]">{task.folder?.name || '—'}</span></p>
                        <p>Тип: <span className="text-[#1f1f1f]">{typeSummary}</span></p>
                        <p>Канал: <span className="text-[#1f1f1f]">{channelLabel(taskChannel)}</span></p>
                      </div>
                    )}
                    <div className="mt-3">{renderRowAction(task)}</div>
                  </div>

                  {!isRequester && <>
                  <div className="hidden xl:block">
                    <button type="button" className="text-left text-sm font-semibold text-[#1f1f1f]" onClick={() => setSelectedTaskId(task.id)}>
                      {displayNumber}
                      {externalReference && <span className="mt-1 block text-xs font-normal text-[#8a8a8a]">FD {externalReference}</span>}
                    </button>
                  </div>
                  <div className="hidden min-w-0 xl:block">
                    <button type="button" className="block w-full min-w-0 text-left" onClick={() => setSelectedTaskId(task.id)}>
                      <p className="truncate text-sm font-semibold text-[#1f1f1f]">{task.title}</p>
                      <p className="mt-1 truncate text-xs text-[#7a7a7a]">{task.description || 'Описание не указано'}</p>
                    </button>
                  </div>
                  <p className="hidden min-w-0 truncate text-sm text-[#4f4f4f] xl:block">{task.author.name}</p>
                  <p className="hidden min-w-0 truncate text-sm text-[#4f4f4f] xl:block">{task.folder?.name || '—'}</p>
                  <p className="hidden min-w-0 truncate text-sm text-[#4f4f4f] xl:block">{typeSummary}</p>
                  <div className="hidden xl:block">
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold ${getStatusColor(task.status)}`}>
                      {getStatusLabel(task.status)}
                    </span>
                  </div>
                  <p className="hidden min-w-0 truncate text-sm text-[#4f4f4f] xl:block">{priorityLabels[task.priority] || task.priority}</p>
                  <p className="hidden min-w-0 truncate text-sm text-[#4f4f4f] xl:block">{primaryAssignee}</p>
                  <p className="hidden min-w-0 truncate text-sm text-[#4f4f4f] xl:block">{formatDateTime(task.updatedAt)}</p>
                  <p className="hidden min-w-0 truncate text-sm text-[#4f4f4f] xl:block">{channelLabel(taskChannel)}</p>
                  <div className="hidden xl:block">{renderRowAction(task)}</div>
                  </>}
                </div>
              );
            })}
            </div>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#ececec] bg-[#fafafa] px-4 py-3 sm:flex-row sm:items-center sm:justify-between" data-testid="ticket-pagination">
            <div className="flex flex-wrap items-center gap-3 text-sm text-[#656565]">
              <span data-testid="ticket-pagination-range">Показаны {rangeStart}–{rangeEnd} из {filteredTotal}</span>
              <label className="inline-flex items-center gap-2">
                <span>На странице</span>
                <select
                  className="input h-9 w-auto min-w-[76px] py-1"
                  value={pageSize}
                  onChange={(event) => setPageSize(Number(event.target.value))}
                  data-testid="ticket-page-size"
                >
                  {[25, 50, 100].map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </label>
            </div>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <span className="text-sm text-[#656565]">Страница {pageIndex + 1} из {pageCount}</span>
              <button
                type="button"
                className="btn inline-flex items-center gap-1"
                onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
                disabled={pageIndex === 0 || loadingTasks}
                data-testid="ticket-pagination-prev"
              >
                <ChevronLeft size={16} />
                Назад
              </button>
              <button
                type="button"
                className="btn inline-flex items-center gap-1"
                onClick={() => setPageIndex((current) => Math.min(pageCount - 1, current + 1))}
                disabled={pageIndex >= pageCount - 1 || loadingTasks}
                data-testid="ticket-pagination-next"
              >
                Вперёд
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      <Modal open={canCreateTicket && open} onClose={() => setOpen(false)} title="Создать заявку" testId="create-ticket-modal">
        <div className="space-y-3">
          <div className="rounded-[12px] border border-[#e3e3e3] bg-[#fcfcfc] px-3 py-3 text-xs leading-5 text-[#6b6b6b]">
            {user?.role === 'REQUESTER'
              ? 'Коротко назовите проблему и добавьте детали: где она возникла, что вы уже пробовали и какой результат ожидаете.'
              : <>Обязательные поля: <span className="font-semibold text-[#3b3b3b]">Название</span> и <span className="font-semibold text-[#3b3b3b]">Описание</span>.</>}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#4f4f4f]">
              {user?.role === 'REQUESTER' ? 'Что случилось? *' : 'Название *'}
            </label>
            <input
              className="input"
              placeholder={user?.role === 'REQUESTER' ? 'Например: не печатает принтер в переговорной' : 'Кратко опишите тему обращения'}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              required
              data-testid="ticket-form-title"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-[#4f4f4f]">Подробности *</label>
            <textarea
              className="input min-h-[128px]"
              rows={4}
              placeholder="Опишите ситуацию своими словами. Если есть текст ошибки — укажите его здесь."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              required
              data-testid="ticket-form-description"
            />
          </div>
          <p className="text-xs text-[#8a8a8a]">
            {user?.role === 'REQUESTER'
              ? 'Поля ниже помогают быстрее направить заявку нужному специалисту. Если не уверены — оставьте их пустыми.'
              : 'Папка, категория, тип, подтип, приоритет и исполнители — опционально.'}
          </p>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <label className="text-sm text-[#5f5f5f]">Папка</label>
              <select
                className="input mt-1"
                value={folderId}
                onChange={(event) => {
                  setFolderId(event.target.value);
                  setTypeId('');
                  setSubtypeId('');
                }}
                data-testid="ticket-form-folder"
              >
                <option value="">Не выбрана</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>{folder.name}</option>
                ))}
              </select>
            </div>
            {(user?.role !== 'REQUESTER' || showCreateDetails) && <div>
              <label className="text-sm text-[#5f5f5f]">Приоритет</label>
              <select
                className="input mt-1"
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority | '')}
                data-testid="ticket-form-priority"
              >
                <option value="">Не выбран</option>
                {Object.entries(priorityLabels).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>}
            {(user?.role !== 'REQUESTER' || showCreateDetails) && <div>
              <label className="text-sm text-[#5f5f5f]">Тип заявки</label>
              <select
                className="input mt-1"
                value={typeId}
                onChange={(event) => {
                  setTypeId(event.target.value);
                  setSubtypeId('');
                }}
                data-testid="ticket-form-type"
              >
                <option value="">Не выбран</option>
                {filteredTypeOptions.map((type) => (
                  <option key={type.id} value={type.id}>{type.name}</option>
                ))}
              </select>
            </div>}
            {(user?.role !== 'REQUESTER' || showCreateDetails) && <div>
              <label className="text-sm text-[#5f5f5f]">Подтип заявки</label>
              <select className="input mt-1" value={subtypeId} onChange={(event) => setSubtypeId(event.target.value)} data-testid="ticket-form-subtype">
                <option value="">Не выбран</option>
                {filteredSubtypeOptions.map((subtype) => (
                  <option key={subtype.id} value={subtype.id}>{subtype.name}</option>
                ))}
              </select>
            </div>}
            <div>
              <label className="text-sm text-[#5f5f5f]">Категория обращения</label>
              <select className="input mt-1" value={entityId} onChange={(event) => setEntityId(event.target.value)} data-testid="ticket-form-entity">
                <option value="">Не выбрана</option>
                {entities.map((entity) => (
                  <option key={entity.id} value={entity.id}>{entity.name}</option>
                ))}
              </select>
            </div>
            {user?.role === 'ADMIN' && (
              <div>
                <label className="mb-1 block text-sm text-[#5f5f5f]">Исполнители</label>
                <p className="mb-2 text-xs text-[#8a8a8a]">Поставьте галочку возле каждого нужного исполнителя.</p>
                <AssigneeCheckboxList users={assignableUsers} selectedIds={assignees} onChange={setAssignees} disabled={isSaving} />
              </div>
            )}
          </div>

          {user?.role === 'REQUESTER' && (
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-[10px] border border-[#e3e3e3] bg-white px-3 py-2.5 text-left text-sm font-medium text-[#4f4f4f] hover:bg-[#fafafa]"
              onClick={() => setShowCreateDetails((value) => !value)}
              aria-expanded={showCreateDetails}
            >
              Уточнить тип и приоритет
              <ChevronDown size={16} className={`transition-transform ${showCreateDetails ? 'rotate-180' : ''}`} />
            </button>
          )}

          {isFeatureEnabled('taskAttachments') && <div
            className="rounded-[10px] border border-dashed border-[#d8d8d8] bg-[#f8f8f8] p-4 text-center text-sm text-[#5f5f5f]"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              if (event.dataTransfer.files) handleFiles(event.dataTransfer.files);
            }}
          >
            Перетащите файлы сюда или
            <label className="ml-1 cursor-pointer font-semibold text-[#2f2f2f] underline">
              выберите
              <input type="file" className="hidden" multiple onChange={(event) => event.target.files && handleFiles(event.target.files)} data-testid="ticket-form-files" />
            </label>
            {files.length > 0 && (
              <div className="mt-2 space-y-1 text-xs text-[#6b6b6b]">
                <div>{files.length} файл(ов) будет прикреплено после сохранения заявки:</div>
                <ul className="mt-2 space-y-1.5 text-left">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${index}`} className="flex items-center justify-between gap-2 rounded-[8px] bg-white px-2 py-1.5">
                      <span className="min-w-0 truncate">{file.name}</span>
                      <button
                        type="button"
                        className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-[7px] text-[#777] hover:bg-[#eeeeee] hover:text-[#222]"
                        onClick={() => setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index))}
                        aria-label={`Убрать файл ${file.name}`}
                        title="Убрать файл"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>}

          {formError && <p className="text-sm text-[#b23b3b]">{formError}</p>}

          <div className="flex justify-end gap-2 pt-2">
            <button className="btn" disabled={isSaving} onClick={() => { resetForm(); setOpen(false); }}>Отмена</button>
            <button className="btn btn-primary" disabled={isSaving || !title.trim() || !description.trim()} onClick={handleCreate} data-testid="submit-create-ticket">
              {isSaving ? 'Создание...' : 'Создать заявку'}
            </button>
          </div>
        </div>
      </Modal>

      <TaskDetailsModal
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        editableUsers={assignableUsers}
        departmentOptions={departmentOptions}
        availableTasks={tasks}
        onStatusChange={(updated) => {
          void refreshInbox();
          setSelectedTaskId(updated.id);
          setSuccessMessage('Заявка обновлена.');
        }}
        onTaskUpdated={(updated) => {
          void refreshInbox();
          setSelectedTaskId(updated.id);
          setSuccessMessage('Заявка сохранена.');
        }}
        onTaskDeleted={() => {
          void refreshInbox();
          setSelectedTaskId(null);
          setSuccessMessage('Заявка удалена.');
        }}
      />
    </div>
  );
};
