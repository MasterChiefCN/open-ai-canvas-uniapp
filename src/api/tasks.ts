import { request } from '../core/http';
import type { Task, TaskLog, TextReplay } from '../types/backend';
import { safeLogs } from '../adapters/open-ai-canvas/task-details';
const path = (id: string) => `/tasks/${encodeURIComponent(id)}`;
export const taskApi = {
  list: (activeOnly = false) =>
    request<Task[]>('/tasks', 'GET', {
      pageSize: 100,
      ...(activeOnly ? { activeOnly: true } : {}),
    }),
  get: (id: string) => request<Task>(path(id)),
  create: (input: object) => request<Task>('/tasks', 'POST', input),
  cancel: (id: string) => request<Task>(path(id) + '/cancel', 'POST'),
  retry: (id: string) => request<Task>(path(id) + '/retry', 'POST'),
  logs: async (id: string): Promise<TaskLog[]> =>
    safeLogs(
      await request<
        Array<{
          level?: unknown;
          message?: unknown;
          payload?: unknown;
          createdAt?: unknown;
        }>
      >(path(id) + '/logs'),
    ),
  deltas: (id: string, after: number) =>
    request<TextReplay>(path(id) + '/text-deltas', 'GET', { after }),
};
