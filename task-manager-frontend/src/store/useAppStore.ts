import { create } from 'zustand';
import { tasksApi, usersApi } from '../api';
import type { TaskSummary, TaskStatus, CreateTaskRequest, UpdateTaskRequest, TeamUser, TasksQuery } from '../types';

const TASK_BATCH_SIZE = 100;
let taskFetchSequence = 0;

interface FetchTasksOptions {
  loadAll?: boolean;
}

interface AppState {
  tasks: TaskSummary[];
  tasksTotal: number;
  tasksLimit: number;
  tasksOffset: number;
  users: TeamUser[];
  loadingTasks: boolean;
  loadingUsers: boolean;
  tasksError: string | null;
  usersError: string | null;
  fetchTasks: (params?: TasksQuery, options?: FetchTasksOptions) => Promise<void>;
  fetchUsers: (params?: { role?: string; search?: string }) => Promise<void>;
  createTask: (payload: CreateTaskRequest) => Promise<TaskSummary>;
  updateTask: (id: string, payload: UpdateTaskRequest) => Promise<TaskSummary>;
  moveTask: (id: string, status: TaskStatus) => Promise<TaskSummary>;
}

export const useAppStore = create<AppState>((set, get) => ({
  tasks: [],
  tasksTotal: 0,
  tasksLimit: 25,
  tasksOffset: 0,
  users: [],
  loadingTasks: false,
  loadingUsers: false,
  tasksError: null,
  usersError: null,

  fetchTasks: async (params, options) => {
    const requestId = ++taskFetchSequence;
    set({ loadingTasks: true, tasksError: null });
    try {
      const firstResponse = await tasksApi.getAll(options?.loadAll
        ? { ...params, limit: TASK_BATCH_SIZE, offset: 0 }
        : params);

      let loadedTasks = firstResponse.tasks;
      if (options?.loadAll && firstResponse.total > loadedTasks.length) {
        const remainingOffsets: number[] = [];
        for (let offset = TASK_BATCH_SIZE; offset < firstResponse.total; offset += TASK_BATCH_SIZE) {
          remainingOffsets.push(offset);
        }

        const remainingPages = await Promise.all(
          remainingOffsets.map((offset) => tasksApi.getAll({
            ...params,
            limit: TASK_BATCH_SIZE,
            offset,
          }))
        );
        loadedTasks = [loadedTasks, ...remainingPages.map((page) => page.tasks)].flat();
      }

      if (requestId === taskFetchSequence) {
        set({
          tasks: loadedTasks,
          tasksTotal: firstResponse.total,
          tasksLimit: options?.loadAll ? loadedTasks.length : firstResponse.limit,
          tasksOffset: options?.loadAll ? 0 : firstResponse.offset,
        });
      }
    } catch (error) {
      if (requestId === taskFetchSequence) {
        const message = error instanceof Error ? error.message : 'Не удалось загрузить заявки';
        set({ tasksError: message });
      }
    } finally {
      if (requestId === taskFetchSequence) {
        set({ loadingTasks: false });
      }
    }
  },

  fetchUsers: async (params) => {
    set({ loadingUsers: true, usersError: null });
    try {
      const users = await usersApi.getAll(params);
      set({ users });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось загрузить пользователей';
      set({ usersError: message });
    } finally {
      set({ loadingUsers: false });
    }
  },

  createTask: async (payload) => {
    const task = await tasksApi.create(payload);
    set({ tasks: [task, ...get().tasks] });
    return task;
  },

  updateTask: async (id, payload) => {
    const task = await tasksApi.update(id, payload);
    set({ tasks: get().tasks.map((t) => (t.id === id ? task : t)) });
    return task;
  },

  moveTask: async (id, status) => {
    const task = await tasksApi.updateStatus(id, status);
    set({ tasks: get().tasks.map((t) => (t.id === id ? task : t)) });
    return task;
  },
}));
