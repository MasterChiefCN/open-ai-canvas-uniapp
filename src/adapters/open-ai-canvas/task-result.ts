import type { Task, TextReplay } from '../../types/backend';
export type MediaResult = {
  kind: 'image' | 'video';
  storageKey?: string;
  url?: string;
};
export function parseResult(task: Task): {
  text: string;
  media: MediaResult[];
  error?: string;
} {
  if (!['canvas_text', 'canvas_image', 'canvas_video'].includes(task.type))
    return { text: '', media: [], error: '此任务类型暂不支持预览' };
  if (!task.resultJson) return { text: task.textDraft || '', media: [] };
  try {
    const result = JSON.parse(task.resultJson);
    if (!result || typeof result !== 'object' || Array.isArray(result)) throw new Error();
    const media: MediaResult[] = [];
    const add = (value: unknown, kind: 'image' | 'video') => {
      if (!value || typeof value !== 'object') return;
      const item = value as Record<string, unknown>;
      media.push({
        kind,
        storageKey: typeof item.storageKey === 'string' ? item.storageKey : undefined,
        url: typeof item.dataUrl === 'string' ? item.dataUrl : undefined,
      });
    };
    if (task.type === 'canvas_image' && Array.isArray(result.images))
      result.images.forEach((item: unknown) => add(item, 'image'));
    if (task.type === 'canvas_video') add(result.video, 'video');
    return {
      text: typeof result.text === 'string' ? result.text : task.textDraft || '',
      media,
    };
  } catch {
    return {
      text: task.textDraft || '',
      media: [],
      error: '任务结果格式异常，请联系管理员',
    };
  }
}
export function mergeText(state: { after: number; text: string }, replay: TextReplay) {
  let { after, text } = state;
  for (const delta of [...(replay.deltas || [])].sort((a, b) => a.sequence - b.sequence))
    if (delta.sequence > after) {
      text += delta.content;
      after = delta.sequence;
    }
  if (replay.textDraft !== undefined) text = replay.textDraft;
  if (replay.finalText !== undefined) text = replay.finalText;
  return { after, text };
}
export const activeTask = (task: Task) => task.status === 'queued' || task.status === 'running';
export const canRetry = (task: Task) =>
  task.status === 'failed' &&
  task.errorCode !== 'sensitive_words_detected' &&
  !/审核|敏感|违规|moderation|content.policy/i.test(task.error || '');
export const statusLabel: Record<string, string> = {
  queued: '排队中',
  running: '生成中',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
};
