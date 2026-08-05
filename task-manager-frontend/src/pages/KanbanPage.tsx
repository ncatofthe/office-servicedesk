import React, { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { useAppStore } from '../store/useAppStore';
import { TaskCard } from '../components/ui/TaskCard';
import type { TaskStatus, TaskPriority } from '../types';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../contexts/AuthContext';
import { useProductSettings } from '../contexts/ProductSettingsContext';
import { canCreateTasks, getModuleVisibility } from '../access';
import { filesApi, serviceDeskFoldersApi, serviceDeskTeamsApi } from '../api';
import { TaskDetailsModal } from '../components/TaskDetailsModal';
import { DataState } from '../components/ui/DataState';
import { AssigneeCheckboxList } from '../components/ui/AssigneeCheckboxList';
import type { ServiceDeskFolder, ServiceDeskTeam } from '../types';
import type { TaskDepartmentOption } from '../utils/task-departments';
import { TASK_BOARD_COLUMNS, TASK_CREATION_STATUS_OPTIONS, normalizeWorkflowStatus } from '../utils';

const getApiErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error !== 'object' || error === null) {
    return fallback;
  }

  const response = (error as { response?: { data?: { error?: string; message?: string } } }).response;
  return response?.data?.error || response?.data?.message || fallback;
};

const toFolderOptions = (folders: ServiceDeskFolder[]): TaskDepartmentOption[] =>
  folders
    .filter((folder) => folder.isActive !== false)
    .map((folder) => ({ id: folder.id, name: folder.name, isPrimary: false }));

export const KanbanPage: React.FC = () => {
  const { user } = useAuth();
  const { isFeatureEnabled } = useProductSettings();
  const {
    tasks,
    fetchTasks,
    moveTask,
    createTask,
    users,
    fetchUsers,
    loadingTasks,
    loadingUsers,
    tasksError,
    usersError,
  } = useAppStore();
  const canCreateTask = canCreateTasks(user?.role) && isFeatureEnabled('ticketCreation');
  const [availableFolders, setAvailableFolders] = useState<ServiceDeskFolder[]>([]);
  const [availableTeams, setAvailableTeams] = useState<ServiceDeskTeam[]>([]);
  const departmentOptions = toFolderOptions(availableFolders);
  const defaultFolderId = departmentOptions[0]?.id || '';
  const isReadOnlyBoard = getModuleVisibility(user?.role, 'kanban') === 'read-only';
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const [status, setStatus] = useState<TaskStatus>('NEW');
  const [dueDate, setDueDate] = useState('');
  const [folderId, setFolderId] = useState(defaultFolderId);
  const [teamId, setTeamId] = useState('');
  const [assignees, setAssignees] = useState<string[]>([]);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [boardError, setBoardError] = useState('');
  const columnMeta: Record<string, { surface: string; badge: string }> = {
    NEW: {
      surface: 'border-[#dce3f2] bg-[linear-gradient(180deg,#f7f9fd_0%,#eff3fb_100%)]',
      badge: 'bg-white text-[#47547f] border border-[#d9e0ef]',
    },
    IN_PROGRESS: {
      surface: 'border-[#f0dfbe] bg-[linear-gradient(180deg,#fffaf1_0%,#fff3df_100%)]',
      badge: 'bg-white text-[#99611f] border border-[#f0dfbe]',
    },
    DONE: {
      surface: 'border-[#cfe4d7] bg-[linear-gradient(180deg,#f4fbf7_0%,#eaf7f0_100%)]',
      badge: 'bg-white text-[#296742] border border-[#cfe4d7]',
    },
  };
  const columnCounts = useMemo(
    () =>
      TASK_BOARD_COLUMNS.reduce<Record<string, number>>((accumulator, column) => {
        accumulator[column.id] = tasks.filter((task) => normalizeWorkflowStatus(task.status) === column.id).length;
        return accumulator;
      }, {}),
    [tasks]
  );

  useEffect(() => {
    fetchTasks();
    if (canCreateTask) {
      fetchUsers();
    }
  }, [canCreateTask, fetchTasks, fetchUsers]);

  useEffect(() => {
    if (!canCreateTask) {
      setAvailableFolders([]);
      setAvailableTeams([]);
      return;
    }

    let isActive = true;

    Promise.all([
      serviceDeskFoldersApi.getAll({ adminFallback: user?.role === 'ADMIN' }),
      serviceDeskTeamsApi.getAll({ adminFallback: user?.role === 'ADMIN' }),
    ])
      .then(([folders, teams]) => {
        if (isActive) {
          setAvailableFolders(folders);
          setAvailableTeams(teams.filter((team) => team.isActive !== false));
        }
      })
      .catch(() => {
        if (isActive) {
          setAvailableFolders([]);
          setAvailableTeams([]);
        }
      });

    return () => {
      isActive = false;
    };
  }, [canCreateTask, user?.role]);

  useEffect(() => {
    if (!openCreate) {
      setFolderId(defaultFolderId);
    }
  }, [defaultFolderId, openCreate]);

  const isOwnedByCurrentUser = (taskId: string) => Boolean(
    user && tasks.find((task) => task.id === taskId)?.assignees.some((assignee) => assignee.userId === user.id)
  );

  const onDrop = async (status: TaskStatus, id: string) => {
    if (isReadOnlyBoard) {
      return;
    }

    const task = tasks.find((item) => item.id === id);
    if (!task || normalizeWorkflowStatus(task.status) === status) {
      return;
    }

    setBoardError('');
    setSuccessMessage('');

    if (!isOwnedByCurrentUser(id)) {
      setBoardError('Изменять статус может только назначенный исполнитель. Для административной передачи сначала переназначьте заявку.');
      return;
    }

    if (status === 'DONE' && task.assignees.length > 1) {
      setSelectedTaskId(id);
      setBoardError('У заявки несколько исполнителей. Откройте её и подтвердите закрытие — заявка завершится после согласия всех исполнителей.');
      return;
    }

    try {
      await moveTask(id, status);
      setSuccessMessage('Статус заявки обновлён.');
    } catch (error) {
      setBoardError(getApiErrorMessage(error, 'Не удалось изменить статус заявки. Откройте карточку и проверьте исполнителя.'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="page-title">Очередь заявок</h1>
          <p className="page-subtitle mt-1">Единая рабочая доска поддержки: новые обращения, заявки в работе и закрытые задачи.</p>
        </div>
        {canCreateTask && (
          <button type="button" className="btn btn-primary inline-flex items-center gap-2 self-start lg:self-auto" onClick={() => setOpenCreate(true)}>
            <Plus size={16} />
            Новая заявка
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {TASK_BOARD_COLUMNS.map((column) => (
          <div key={column.id} className="rounded-[18px] border border-[#e1e1e1] bg-white px-4 py-4 shadow-[0_14px_34px_rgba(0,0,0,0.05)]">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-[#1f1f1f]">{column.title}</p>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${columnMeta[column.id].badge}`}>
                {columnCounts[column.id] || 0}
              </span>
            </div>
            <p className="mt-2 text-xs text-[#8a8a8a]">
              {column.id === 'NEW'
                ? 'Новые обращения, которые ещё не взяли в работу.'
                : column.id === 'IN_PROGRESS'
                  ? 'Заявки, по которым идёт коммуникация и исполнение.'
                  : 'Закрытые обращения, готовые к просмотру и поиску.'}
            </p>
          </div>
        ))}
      </div>

      {successMessage && (
        <div className="rounded-[12px] border border-[#b8e4c6] bg-[#eef9f2] px-4 py-3 text-sm text-[#1f7a42]">
          {successMessage}
        </div>
      )}

      {boardError && (
        <div className="rounded-[12px] border border-[#efc1c1] bg-[#fff3f3] px-4 py-3 text-sm text-[#a12f2f]" role="alert">
          {boardError}
        </div>
      )}

      {isReadOnlyBoard && (
        <DataState
          variant="empty"
          message="У вас открыт режим просмотра. Карточки можно открывать и читать, но перетаскивание недоступно для вашей роли."
        />
      )}

      <div className="pb-2">
      {loadingTasks || (canCreateTask && loadingUsers) ? (
        <DataState variant="loading" message="Загружаем заявки и пользователей..." />
      ) : tasksError || (canCreateTask && usersError) ? (
        <DataState variant="error" message={tasksError || (canCreateTask ? usersError : null) || 'Не удалось загрузить данные'} />
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-3">
      {TASK_BOARD_COLUMNS.map((col) => {
        const columnTasks = tasks.filter((t) => normalizeWorkflowStatus(t.status) === col.id);

        return (
        <section key={col.id} className={`min-w-0 rounded-[24px] border p-3 shadow-[0_18px_34px_rgba(0,0,0,0.05)] ${columnMeta[col.id].surface}`}>
            <div className="mb-3 flex items-center justify-between rounded-[16px] border border-white/90 bg-[rgba(255,255,255,0.92)] px-3 py-3">
              <div>
                <h3 className="text-sm font-semibold text-[#313131]">{col.title}</h3>
                <p className="mt-1 text-xs text-[#8a8a8a]">Карточек: {columnTasks.length}</p>
              </div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${columnMeta[col.id].badge}`}>
                {columnCounts[col.id] || 0}
              </span>
            </div>
          {isFeatureEnabled('taskAttachments') && <div
            className="min-h-[340px] space-y-3 rounded-[18px] border border-dashed border-white/90 bg-[rgba(255,255,255,0.7)] p-3 md:min-h-[520px]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = e.dataTransfer.getData('task');
              if (id) {
                onDrop(col.id, id);
              }
            }}
          >
            {columnTasks.map((t) => (
              <div
                key={t.id}
                draggable={!isReadOnlyBoard && isOwnedByCurrentUser(t.id)}
                className={!isReadOnlyBoard && isOwnedByCurrentUser(t.id) ? 'cursor-grab active:cursor-grabbing' : 'cursor-default'}
                title={!isReadOnlyBoard && !isOwnedByCurrentUser(t.id) ? 'Статус меняет назначенный исполнитель' : undefined}
                onDragStart={(e) => e.dataTransfer.setData('task', t.id)}
              >
                <TaskCard task={t} onClick={() => setSelectedTaskId(t.id)} />
              </div>
            ))}
            {columnTasks.length === 0 && (
              <div className="flex min-h-[180px] flex-col items-center justify-center rounded-[12px] border border-dashed border-[#dddddd] bg-white p-4 text-center text-sm text-[#6c6c6c]">
                <p className="font-medium text-[#4a4a4a]">Колонка пока пуста</p>
                <p className="mt-1 text-xs text-[#8a8a8a]">
                  {isReadOnlyBoard
                    ? 'Заявки появятся здесь, когда сменится статус.'
                    : 'Перетащите заявку сюда или создайте новую карточку.'}
                </p>
              </div>
            )}
          </div>}
        </section>
      )})}
        </div>
      )}
      </div>

      <Modal open={canCreateTask && openCreate} onClose={() => setOpenCreate(false)} title="Создать заявку">
        <div className="space-y-3">
          <div className="rounded-[10px] border border-[#e3e3e3] bg-[#fcfcfc] px-3 py-2 text-xs text-[#6b6b6b]">
            Обязательные поля: <span className="font-semibold text-[#3b3b3b]">Название</span> и <span className="font-semibold text-[#3b3b3b]">Описание</span>.
          </div>
          <input className="input" placeholder="Название *" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            className="input min-h-[100px]"
            placeholder="Описание *"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <p className="text-xs text-[#8a8a8a]">Дополнительные параметры ниже можно не заполнять при быстром создании заявки.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm text-[#5f5f5f]">Приоритет</label>
              <select className="input mt-1" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                <option value="LOW">Низкий</option>
                <option value="MEDIUM">Средний</option>
                <option value="HIGH">Высокий</option>
                <option value="URGENT">Срочный</option>
              </select>
            </div>
            <div>
              <label className="text-sm text-[#5f5f5f]">Статус</label>
              <select className="input mt-1" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                {TASK_CREATION_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
                <label className="text-sm text-[#5f5f5f]">Срок</label>
              <input type="date" className="input mt-1" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
            {departmentOptions.length > 0 && (
              <div>
                <label className="text-sm text-[#5f5f5f]">Папка</label>
                <select
                  className="input mt-1"
                  value={folderId}
                  onChange={(e) => setFolderId(e.target.value)}
                >
                  <option value="">Не указан</option>
                  {departmentOptions.map((department) => (
                    <option key={department.id} value={department.id}>
                      {department.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {user?.role === 'ADMIN' && <div>
              <label className="text-sm text-[#5f5f5f]">Команда исполнителей</label>
              <select className="input mt-1" value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={saving}>
                <option value="">Не назначена</option>
                {availableTeams.map((team) => (
                  <option key={team.id} value={team.id}>{team.name}</option>
                ))}
              </select>
            </div>}
            {user?.role === 'ADMIN' && <div>
              <label className="mb-1 block text-sm text-[#5f5f5f]">Личные исполнители</label>
              <p className="mb-2 text-xs text-[#8a8a8a]">Отметьте одного или нескольких сотрудников.</p>
              <AssigneeCheckboxList users={users} selectedIds={assignees} onChange={setAssignees} disabled={saving} />
            </div>}
          </div>
          <div
            className="border border-dashed border-[#d8d8d8] rounded-[10px] p-4 text-center text-sm text-[#5f5f5f] bg-[#f8f8f8]"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files) setFiles(Array.from(e.dataTransfer.files));
            }}
          >
            Перетащите файлы сюда или
            <label className="text-primary font-semibold cursor-pointer ml-1">
              выберите
              <input type="file" className="hidden" multiple onChange={(e) => e.target.files && setFiles(Array.from(e.target.files))} />
            </label>
            {files.length > 0 && <div className="mt-1 text-xs text-gray-500">{files.length} файл(ов) будет прикреплено после сохранения</div>}
          </div>
          {formError && <p className="text-sm text-[#b23b3b]">{formError}</p>}
          <div className="flex justify-end gap-2">
            <button className="btn" disabled={saving} onClick={() => setOpenCreate(false)}>Отмена</button>
            <button
              className="btn btn-primary"
              disabled={saving || !title.trim() || !description.trim()}
              onClick={async () => {
                if (!title.trim()) {
                  setFormError('Введите название заявки');
                  return;
                }

                if (!description.trim()) {
                  setFormError('Введите описание заявки');
                  return;
                }

                setSaving(true);
                setFormError('');
                setSuccessMessage('');
                try {
                  const task = await createTask({
                    title: title.trim(),
                    description: description.trim(),
                    priority,
                    status,
                    dueDate: dueDate || undefined,
                    folderId: folderId || undefined,
                    teamId: user?.role === 'ADMIN' ? teamId || undefined : undefined,
                    assigneeIds: user?.role === 'ADMIN' ? assignees : []
                  });
                  if (files.length) {
                    await Promise.all(files.map((f) => filesApi.uploadTaskFile(task.id, f)));
                  }
                  setOpenCreate(false);
                  setTitle('');
                  setDescription('');
                  setFolderId(defaultFolderId);
                  setTeamId('');
                  setAssignees([]);
                  setFiles([]);
                  fetchTasks();
                  setSuccessMessage('Заявка создана.');
                } catch {
                  setFormError('Не удалось создать заявку. Проверьте данные и попробуйте снова.');
                } finally {
                  setSaving(false);
                }
              }}
            >
              {saving ? 'Создание...' : 'Создать заявку'}
            </button>
          </div>
        </div>
      </Modal>

      <TaskDetailsModal
        taskId={selectedTaskId}
        open={!!selectedTaskId}
        onClose={() => setSelectedTaskId(null)}
        editableUsers={users}
        departmentOptions={departmentOptions}
        availableTasks={tasks}
        onStatusChange={() => {
          fetchTasks();
          setSuccessMessage('Заявка обновлена.');
        }}
        onTaskUpdated={() => {
          fetchTasks();
          setSuccessMessage('Заявка сохранена.');
        }}
        onTaskDeleted={() => {
          fetchTasks();
          setSelectedTaskId(null);
          setSuccessMessage('Заявка удалена.');
        }}
      />
    </div>
  );
};
