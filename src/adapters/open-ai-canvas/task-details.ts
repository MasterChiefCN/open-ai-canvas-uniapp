import type { TaskLog, Task } from '../../types/backend';
import { optionLabels } from './model-capabilities';
export function safeLogs(
  logs: Array<{
    level?: unknown;
    message?: unknown;
    payload?: unknown;
    createdAt?: unknown;
  }>,
): TaskLog[] {
  return logs.map((log, index) => {
    const source = [log.message, log.payload]
      .filter((value) => typeof value === 'string')
      .join(' ');
    const stage =
      source
        .match(
          /(?:^|[^a-z0-9_])(queued|submitting|submitted|generating|submission_unknown|processing|completed|succeeded|failed|cancelled)(?:$|[^a-z0-9_])/i,
        )?.[1]
        ?.toLowerCase() || 'backend_event';
    return {
      id: String(index),
      level: log.level === 'error' ? 'error' : log.level === 'warn' ? 'warn' : 'info',
      stage,
      createdAt: typeof log.createdAt === 'string' ? log.createdAt : '',
    };
  });
}
export function taskParameters(task: Task): Array<{ label: string; value: string }> {
  try {
    const input = JSON.parse(task.inputJson || '{}');
    const parameters = { ...input.config, ...input.capabilityOptions };
    return Object.entries(optionLabels).flatMap(([key, label]) => {
      const value = parameters[key];
      return ['string', 'number', 'boolean'].includes(typeof value)
        ? [{ label, value: String(value) }]
        : [];
    });
  } catch {
    return [];
  }
}
