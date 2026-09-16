import { taskApi } from '../api/tasks';
import { useTasks } from '../stores/tasks';
import { onSessionReset, useAuth } from '../stores/auth';
import { useWallet } from '../stores/wallet';
import { activeTask, mergeText } from '../adapters/open-ai-canvas/task-result';
import { requestEpoch } from '../core/http';
const owners = new Map<string, string[]>();
const textStates = new Map<string, { after: number; text: string }>();
let foreground = true;
let timer: ReturnType<typeof setTimeout> | undefined;
let running = false;
let failures = 0;
function stopTimer() {
  if (timer) clearTimeout(timer);
  timer = undefined;
}
function schedule() {
  stopTimer();
  const items = useTasks().items;
  const hasActive = [...owners.values()].flat().some((id) => !items[id] || activeTask(items[id]));
  if (foreground && owners.size && hasActive && !running)
    timer = setTimeout(tick, Math.min(30000, 2200 * 2 ** failures));
}
async function tick() {
  if (!foreground || !owners.size || !useAuth().user) return;
  running = true;
  const epoch = requestEpoch();
  try {
    const store = useTasks();
    const ids = [...new Set([...owners.values()].flat())];
    for (const id of ids) {
      if (!foreground || !owners.size || epoch !== requestEpoch()) break;
      const previous = store.items[id];
      if (previous && !activeTask(previous)) continue;
      const task = await taskApi.get(id);
      if (task.type === 'canvas_text' && activeTask(task) && foreground && owners.size) {
        const current = textStates.get(id) || { after: 0, text: '' };
        const replay = await taskApi.deltas(id, current.after);
        const merged = mergeText(current, replay);
        textStates.set(id, merged);
        task.textDraft = merged.text;
      }
      store.put(task);
      if (!activeTask(task)) {
        textStates.delete(id);
        await useWallet().balance();
      }
    }
    failures = 0;
  } catch {
    failures = Math.min(4, failures + 1);
  } finally {
    running = false;
    schedule();
  }
}
export function watchTasks(owner: string, ids: string[]) {
  owners.set(owner, ids);
  schedule();
}
export function unwatchTasks(owner: string) {
  owners.delete(owner);
  if (!owners.size) stopTimer();
}
export function setForeground(value: boolean) {
  foreground = value;
  if (value) schedule();
  else stopTimer();
}
onSessionReset(() => {
  owners.clear();
  textStates.clear();
  stopTimer();
  failures = 0;
});
