import { defineStore } from 'pinia';
import { ref } from 'vue';
import { taskApi } from '../api/tasks';
import { onSessionReset, useAuth } from './auth';
import { storage } from '../core/storage';
import type { Task } from '../types/backend';
import { activeTask } from '../adapters/open-ai-canvas/task-result';
export const useTasks = defineStore('tasks', () => {
  const items = ref<Record<string, Task>>({});
  const recentIds = ref<string[]>([]);
  const createdIds = ref<string[]>([]);
  onSessionReset(() => {
    items.value = {};
    recentIds.value = [];
    createdIds.value = [];
  });
  function put(task: Task) {
    items.value[task.id] = task;
  }
  function remember(task: Task) {
    put(task);
    createdIds.value = [...new Set([task.id, ...createdIds.value])].slice(0, 100);
    const id = useAuth().user?.id;
    if (id) storage.set(storage.userKey(id, 'created-tasks'), createdIds.value);
  }
  function restore() {
    const id = useAuth().user?.id;
    if (id) createdIds.value = storage.get<string[]>(storage.userKey(id, 'created-tasks')) || [];
  }
  async function refresh() {
    const [recent, active] = await Promise.all([taskApi.list(), taskApi.list(true)]);
    for (const task of [...recent, ...active]) put(task);
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
