import type { Task } from '../../types/backend';
import { sha256 } from '../../core/sha256';

export type AssetOutput =
  | { index: number; kind: 'text'; content: string }
  | {
      index: number;
      kind: 'image' | 'video';
      media: Record<string, unknown>;
    };
export function generationAssetIdentity(taskId: string, index: number) {
  const effectKey = `materialize:${taskId}:${index}`;
  return { effectKey, id: `generation_${sha256(effectKey)}` };
}
export function isMiniProgramTask(task: Task): boolean {
  try {
    return JSON.parse(task.inputJson || '{}')?.metadata?.source === 'uniapp-wechat';
  } catch {
    return false;
  }
}
export function taskAssetOutputs(task: Task): AssetOutput[] {
  if (task.status !== 'succeeded') return [];
  let result: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(task.resultJson || '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    result = parsed as Record<string, unknown>;
  } catch {
    throw new Error('生成结果格式异常，无法同步素材');
  }
  if (task.type === 'canvas_text') {
    const content = typeof result.text === 'string' ? result.text : task.textDraft;
    if (!content?.trim()) throw new Error('生成结果缺少文本内容');
    return [{ index: 0, kind: 'text', content }];
  }
  const kind =
    task.type === 'canvas_image' ? 'image' : task.type === 'canvas_video' ? 'video' : undefined;
  if (!kind) return [];
  const media = kind === 'image' ? result.images : [result.video];
  if (!Array.isArray(media) || !media.length) throw new Error('生成结果缺少媒体内容');
  return media.map((item: unknown, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item))
      throw new Error('生成结果中的媒体内容无效');
    return { index, kind, media: item as Record<string, unknown> };
  });
}
