import { defineStore } from 'pinia';
import { ref } from 'vue';
import { taskApi } from '../api/tasks';
import { onSessionReset, useAuth } from './auth';
import { storage } from '../core/storage';
import type { Task } from '../types/backend';
import { activeTask } from '../adapters/open-ai-canvas/task-result';
import { syncTaskAssets } from '../services/asset-sync';
export const useTasks = defineStore('tasks', () => {
  const items = ref<Record<string, Task>>({});
  const recentIds = ref<string[]>([]);
  const createdIds = ref<string[]>([]);
  onSessionReset(() => {
    items.value = {};
    recentIds.value = [];
    createdIds.value = [];
  });
  function put(task: Task, retryAssets = false) {
    const previous = items.value[task.id];
    items.value[task.id] = previous?.updatedAt === task.updatedAt ? { ...previous, ...task } : task;
    void syncTaskAssets(items.value[task.id], createdIds.value.includes(task.id), retryAssets);
  }
  function remember(task: Task) {
    createdIds.value = [...new Set([task.id, ...createdIds.value])].slice(0, 100);
    put(task);
    const id = useAuth().user?.id;
    if (id) storage.set(storage.userKey(id, 'created-tasks'), createdIds.value);
  }
  function restore() {
    const id = useAuth().user?.id;
    if (id) createdIds.value = storage.get<string[]>(storage.userKey(id, 'created-tasks')) || [];
  }
  async function refresh() {
    restore();
    const [recent, active] = await Promise.all([taskApi.list(), taskApi.list(true)]);
    for (const task of [...recent, ...active]) put(task, true);
    recentIds.value = [...new Set([...recent, ...active].map((task) => task.id))];
  }
  return {
    items,
    recentIds,
    createdIds,
    put,
    remember,
    restore,
    refresh,
    activeTask,
  };
});
