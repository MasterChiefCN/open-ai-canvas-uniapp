import { taskApi } from '../api/tasks';
import { modelApi } from '../api/models';
import { normalizeCatalog, operationFor } from '../adapters/open-ai-canvas/model-capabilities';
import { generationPayload, type HistoryMessage } from '../adapters/open-ai-canvas/generation';
import { useTasks } from '../stores/tasks';
import { useAuth } from '../stores/auth';
import { useWallet } from '../stores/wallet';
import { assertEpoch, requestEpoch } from '../core/http';
import type { Model, ImageReference, Task } from '../types/backend';
export async function generate(
  model: Model,
  prompt: string,
  references: ImageReference[],
  options: Record<string, unknown>,
  history: HistoryMessage[],
) {
  const epoch = requestEpoch();
  const count = model.mode === 'image' ? Math.max(1, Math.min(15, Number(options.count) || 1)) : 1;
  const active = await taskApi.list(true);
  const limit = useAuth().session.runtimeLimits?.activeTaskLimit;
  if (limit && active.length + count > limit)
    throw new Error(`最多同时运行 ${limit} 个任务，请等待已有任务结束`);
  const available = normalizeCatalog(
    await modelApi.available({
      capability: model.mode,
      operation: operationFor(model.mode, references.length),
      inputs: { image: references.length, text: 0, video: 0, audio: 0 },
      options,
    }),
  );
  if (!available.some((item) => item.id === model.id))
    throw new Error('当前模型或参数组合暂不可用，请刷新模型后重试');
  const completed: Task[] = [];
  let error = '';
  for (let batchIndex = 0; batchIndex < count; batchIndex++) {
    assertEpoch(epoch);
    try {
      const singleOptions = {
        ...options,
        ...(model.mode === 'image' && 'count' in options ? { count: 1 } : {}),
      };
      const task = await taskApi.create(
        generationPayload(model, prompt, references, singleOptions, history, {
          batchIndex,
          batchCount: count,
        }),
      );
      useTasks().remember(task);
      completed.push(task);
    } catch (failure) {
      error = failure instanceof Error ? failure.message : '提交失败';
      break;
    }
  }
  try {
    await useWallet().balance();
  } catch {
    /* 任务已记录，余额失败不掩盖提交结果 */
  }
  return { tasks: completed, error, requested: count };
}
