import { reactive } from 'vue';
import { assetApi, type LibraryAsset } from '../api/assets';
import { resourceApi } from '../api/resources';
import { taskApi } from '../api/tasks';
import { onSessionReset, useAuth } from '../stores/auth';
import { ApiError, assertEpoch, requestEpoch, StaleRequestError } from '../core/http';
import { apiUrl, resourceUrl } from '../core/urls';
import { storage } from '../core/storage';
import {
  generationAssetIdentity,
  isUniAppTask,
  taskAssetOutputs,
  type AssetOutput,
} from '../adapters/open-ai-canvas/task-assets';
import type { Task } from '../types/backend';

type SyncState = {
  status: 'checking' | 'syncing' | 'synced' | 'error' | 'skipped';
  message?: string;
  retryAt?: number;
};
export const assetSyncStates = reactive<Record<string, SyncState>>({});
const pending = new Map<string, Promise<void>>();
let queue: Promise<void> = Promise.resolve();
let nextRequestAt = 0;

onSessionReset(() => {
  for (const id of Object.keys(assetSyncStates)) delete assetSyncStates[id];
  pending.clear();
  queue = Promise.resolve();
  nextRequestAt = 0;
});

function positive(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
function nonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}
export async function mediaDimensions(kind: 'image' | 'video', url: string) {
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('读取媒体尺寸超时，请稍后重试同步')), 30000);
    const success = (info: { width: number; height: number }) => {
      clearTimeout(timer);
      resolve(info);
    };
    const fail = () => {
      clearTimeout(timer);
      reject(new Error('无法读取媒体尺寸，请检查下载域名后重试同步'));
    };
    try {
      if (kind === 'image') uni.getImageInfo({ src: url, success, fail });
      else uni.getVideoInfo({ src: url, success, fail });
    } catch {
      fail();
    }
  });
}

async function buildAsset(task: Task, output: AssetOutput, epoch: number): Promise<LibraryAsset> {
  const identity = generationAssetIdentity(task.id, output.index);
  const asset: LibraryAsset = {
    id: identity.id,
    kind: output.kind,
    title:
      Array.from(task.prompt.trim()).slice(0, 60).join('') ||
      `生成${output.kind === 'text' ? '文本' : output.kind === 'image' ? '图片' : '视频'}`,
    coverUrl: '',
    tags: ['生成'],
    status: 'confirmed',
    source: '生成任务',
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
    metadata: {
      source: 'generation-task',
      generationEffectKey: identity.effectKey,
      taskId: task.id,
      outputIndex: output.index,
    },
    data: {},
  };
  if (output.kind === 'text') {
    asset.data = { content: output.content };
    return asset;
  }
  const media = output.media;
  const key = typeof media.storageKey === 'string' ? media.storageKey : '';
  let resource;
  if (key.startsWith('resource:') && key.slice(9).trim()) {
    resource = (await resourceApi.get(key.slice(9))).resource;
  } else {
    // Legacy/external results must become durable backend resources before being
    // referenced by the library. The upstream importer supports this stable key.
    const rawUrl =
      typeof media.dataUrl === 'string'
        ? media.dataUrl
        : typeof media.url === 'string'
          ? media.url
          : '';
    if (!rawUrl) throw new Error('生成结果缺少可同步的资源地址');
    resource = (await resourceApi.importUrl(resourceUrl(rawUrl), output.kind, identity.id))
      .resource;
  }
  assertEpoch(epoch);
  if (!resource.id || (resource.status && resource.status !== 'ready'))
    throw new Error('生成资源尚未就绪，稍后可重试同步');
  let width = positive(resource.width) ? resource.width : media.width;
  let height = positive(resource.height) ? resource.height : media.height;
  if (!positive(width) || !positive(height)) {
    const { url } = await resourceApi.url(resource.id);
    assertEpoch(epoch);
    const dimensions = await mediaDimensions(output.kind, resourceUrl(url));
    assertEpoch(epoch);
    width = dimensions.width;
    height = dimensions.height;
  }
  if (!positive(width) || !positive(height)) throw new Error('媒体尺寸无效，无法写入素材库');
  const mimeType =
    resource.mimeType ||
    (typeof media.mimeType === 'string' ? media.mimeType : 'application/octet-stream');
  if (
    !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(mimeType) ||
    (mimeType !== 'application/octet-stream' && !mimeType.startsWith(`${output.kind}/`))
  )
    throw new Error('媒体类型与生成结果不一致');
  const url = apiUrl(`/resources/${encodeURIComponent(resource.id)}/file`);
  asset.data = {
    [output.kind === 'image' ? 'dataUrl' : 'url']: url,
    storageKey: `resource:${resource.id}`,
    width,
    height,
    bytes: nonNegative(resource.size) ? resource.size : nonNegative(media.bytes) ? media.bytes : 0,
    mimeType,
  };
  if (output.kind === 'image') asset.coverUrl = url;
  if (output.kind === 'video' && nonNegative(resource.durationMs))
    asset.data.durationMs = resource.durationMs;
  return asset;
}

/** Serial, per-session synchronization. Re-entry never overwrites an existing
 * Web asset; partial/ambiguous failures are reconciled by GET before a PUT. */
export function syncTaskAssets(task: Task, knownCreated = false, retry = false): Promise<void> {
  const userId = useAuth().user?.id;
  if (
    !userId ||
    task.status !== 'succeeded' ||
    !['canvas_text', 'canvas_image', 'canvas_video'].includes(task.type)
  )
    return Promise.resolve();
  const epoch = requestEpoch();
  const key = `${epoch}:${userId}:${task.id}`;
  const existing = pending.get(key);
  if (existing) return existing;
  const state = assetSyncStates[task.id];
  if (
    state?.status === 'synced' ||
    state?.status === 'skipped' ||
    (state?.status === 'error' && (!retry || Date.now() < (state.retryAt || 0)))
  )
    return Promise.resolve();
  const marker = storage.userKey(userId, `asset-sync:${task.id}`);
  if (storage.get(marker)) {
    assetSyncStates[task.id] = { status: 'synced' };
    return Promise.resolve();
  }
  assetSyncStates[task.id] = { status: 'checking' };
  const operation = queue.then(async () => {
    try {
      assertEpoch(epoch);
      if (Date.now() < nextRequestAt)
        throw new ApiError(
          '素材同步请求受限，请稍后重试',
          429,
          429,
          undefined,
          nextRequestAt - Date.now(),
        );
      // /tasks returns summaries without inputJson/resultJson. Fetch detail even
      // when a task completed while the mini program was closed.
      const full = task.inputJson && task.resultJson ? task : await taskApi.get(task.id);
      assertEpoch(epoch);
      if (!knownCreated && !isUniAppTask(full)) {
        assetSyncStates[task.id] = { status: 'skipped' };
        return;
      }
      if (full.status !== 'succeeded') {
        delete assetSyncStates[task.id];
        return;
      }
      assetSyncStates[task.id] = { status: 'syncing' };
      const outputs = taskAssetOutputs(full);
      if (!outputs.length) throw new Error('生成结果没有可同步的素材');
      for (const output of outputs) {
        assertEpoch(epoch);
        const { id } = generationAssetIdentity(full.id, output.index);
        const saved = await assetApi.get(id);
        assertEpoch(epoch);
        if (saved) continue;
        const asset = await buildAsset(full, output, epoch);
        assertEpoch(epoch);
        await assetApi.put(asset);
        assertEpoch(epoch);
      }
      storage.set(marker, true);
      assetSyncStates[task.id] = { status: 'synced' };
    } catch (error) {
      if (epoch !== requestEpoch() || error instanceof StaleRequestError) return;
      if (error instanceof ApiError && error.status === 429)
        nextRequestAt = Math.max(nextRequestAt, Date.now() + error.retryAfterMs);
      assetSyncStates[task.id] = {
        status: 'error',
        message: error instanceof Error ? error.message : '素材同步失败',
        retryAt:
          error instanceof ApiError && error.status === 429
            ? Date.now() + error.retryAfterMs
            : undefined,
      };
    }
  });
  pending.set(key, operation);
  queue = operation.catch(() => {});
  void operation.finally(() => {
    if (pending.get(key) === operation) pending.delete(key);
  });
  return operation;
}
