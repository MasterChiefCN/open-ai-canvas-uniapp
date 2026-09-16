import { reactive } from 'vue';
import { clientSource, isNativeApp } from '../core/runtime';
import { chooseNativeAudio } from './native-audio';
import { assetApi, type LibraryAsset } from '../api/assets';
import { resourceApi } from '../api/resources';
import { ApiError, assertEpoch, requestEpoch } from '../core/http';
import { sha256 } from '../core/sha256';
import { storage } from '../core/storage';
import { apiUrl, resourceUrl } from '../core/urls';
import { useAuth, onSessionReset } from '../stores/auth';
import { mediaDimensions } from './asset-sync';
import type { MediaKind, Resource } from '../types/backend';

type UploadRecord = { resource: Resource; kind: MediaKind; name: string; createdAt: string };
type UploadState = UploadRecord & { status: 'syncing' | 'synced' | 'error'; message?: string };
export const referenceUploadStates = reactive<Record<string, UploadState>>({});
const pending = new Map<string, Promise<void>>();
let queue = Promise.resolve();
let retryAt = 0;
onSessionReset(() => {
  Object.keys(referenceUploadStates).forEach((id) => delete referenceUploadStates[id]);
  pending.clear();
  queue = Promise.resolve();
  retryAt = 0;
});

function persist(userId: string) {
  // Keep only unfinished durable resource references, never local paths or signed URLs.
  storage.set(
    storage.userKey(userId, 'reference-asset-pending'),
    Object.values(referenceUploadStates)
      .filter((item) => item.status !== 'synced')
      .map(({ resource, kind, name, createdAt }) => ({ resource, kind, name, createdAt })),
  );
}
export const referenceAssetId = (id: string) => `upload_${sha256(`uniapp-reference:${id}`)}`;

export function syncReferenceAsset(record: UploadRecord): Promise<void> {
  const userId = useAuth().user?.id;
  if (!userId) return Promise.resolve();
  const epoch = requestEpoch();
  const id = record.resource.id;
  const key = `${epoch}:${userId}:${id}`;
  if (pending.has(key)) return pending.get(key)!;
  if (referenceUploadStates[id]?.status === 'synced') return Promise.resolve();
  referenceUploadStates[id] = { ...record, status: 'syncing' };
  persist(userId);
  const operation = queue.then(async () => {
    try {
      assertEpoch(epoch);
      if (Date.now() < retryAt) throw new Error('素材同步请求受限，请稍后重试');
      const assetId = referenceAssetId(id);
      const existing = await assetApi.get(assetId);
      assertEpoch(epoch);
      if (!existing) {
        const { resource, kind, name, createdAt } = record;
        if (!id || (resource.status && resource.status !== 'ready'))
          throw new Error('上传资源尚未就绪');
        const mimeType = resource.mimeType || 'application/octet-stream';
        if (
          (resource.kind && resource.kind !== kind) ||
          !/^[\w.+-]+\/[\w.+-]+$/.test(mimeType) ||
          (mimeType !== 'application/octet-stream' && !mimeType.startsWith(`${kind}/`))
        )
          throw new Error('上传资源类型不匹配');
        const url = apiUrl(`/resources/${encodeURIComponent(id)}/file`);
        const asset: LibraryAsset = {
          id: assetId,
          kind,
          title: name,
          coverUrl: kind === 'image' ? url : '',
          tags: ['创作'],
          status: 'confirmed',
          source: '创作页',
          createdAt,
          updatedAt: createdAt,
          metadata: {
            source: 'create-upload',
            client: clientSource(),
            resourceId: id,
            fileName: name,
          },
          data: {
            [kind === 'image' ? 'dataUrl' : 'url']: url,
            storageKey: `resource:${id}`,
            bytes: Math.max(0, resource.size || 0),
            mimeType,
          },
        };
        if (kind !== 'audio') {
          let { width, height } = resource;
          if (!(Number.isFinite(width) && width! > 0 && Number.isFinite(height) && height! > 0)) {
            const signed = await resourceApi.url(id);
            assertEpoch(epoch);
            ({ width, height } = await mediaDimensions(kind, resourceUrl(signed.url)));
            assertEpoch(epoch);
          }
          if (!Number.isFinite(width) || !Number.isFinite(height) || width! <= 0 || height! <= 0)
            throw new Error('媒体尺寸无效');
          asset.data.width = width!;
          asset.data.height = height!;
        }
        if (kind !== 'image' && Number.isFinite(resource.durationMs) && resource.durationMs! >= 0)
          asset.data.durationMs = resource.durationMs!;
        assertEpoch(epoch);
        await assetApi.put(asset);
        assertEpoch(epoch);
      }
      referenceUploadStates[id] = { ...record, status: 'synced' };
      persist(userId);
    } catch (error) {
      if (requestEpoch() !== epoch) return;
      if (error instanceof ApiError && error.status === 429)
        retryAt = Date.now() + error.retryAfterMs;
      referenceUploadStates[id] = {
        ...record,
        status: 'error',
        message: error instanceof Error ? error.message : '入库失败',
      };
      persist(userId);
    }
  });
  pending.set(key, operation);
  queue = operation.catch(() => {});
  void operation.finally(() => {
    if (pending.get(key) === operation) pending.delete(key);
  });
  return operation;
}

export async function resumeReferenceAssets() {
  const userId = useAuth().user?.id;
  if (!userId) return;
  const epoch = requestEpoch();
  const records =
    storage.get<UploadRecord[]>(storage.userKey(userId, 'reference-asset-pending')) || [];
  // Seed all entries before any successful sync persists the remaining work.
  for (const record of records) {
    if (!referenceUploadStates[record.resource.id])
      referenceUploadStates[record.resource.id] = { ...record, status: 'error' };
  }
  for (const record of records) {
    assertEpoch(epoch);
    await syncReferenceAsset(record);
  }
}

export async function uploadReference(
  path: string,
  kind: MediaKind,
  name: string,
  meta: { width?: number; height?: number; durationMs?: number } = {},
) {
  const epoch = requestEpoch();
  if (!useAuth().user) throw new Error('请先登录');
  const { resource: uploaded } = await resourceApi.upload(path, kind, meta);
  assertEpoch(epoch);
  const resource: Resource = {
    id: uploaded.id,
    kind: uploaded.kind,
    status: uploaded.status,
    mimeType: uploaded.mimeType,
    size: uploaded.size,
    width: uploaded.width || meta.width,
    height: uploaded.height || meta.height,
    durationMs: uploaded.durationMs ?? meta.durationMs,
  };
  // Resource returned by upload is durable; a library failure must never trigger another upload.
  const record = { resource, kind, name, createdAt: new Date().toISOString() };
  await syncReferenceAsset(record);
  assertEpoch(epoch);
  return resource;
}

export type SelectedReference = {
  cleanup?: () => void;
  path: string;
  name: string;
  size: number;
  width?: number;
  height?: number;
  durationMs?: number;
};
export async function chooseReferences(
  kind: MediaKind,
  count: number,
  maxBytes = 50 * 1024 * 1024,
): Promise<SelectedReference[]> {
  if (count <= 0) return [];
  if (kind === 'image') {
    const selected = await new Promise<UniApp.ChooseImageSuccessCallbackResult>((success, fail) =>
      uni.chooseImage({ count: Math.min(9, count), sizeType: ['compressed'], success, fail }),
    );
    const files = Array.isArray(selected.tempFiles) ? selected.tempFiles : [];
    const paths = Array.isArray(selected.tempFilePaths)
      ? selected.tempFilePaths
      : [selected.tempFilePaths];
    return paths.map((path, index) => ({
      path,
      name: `参考图片 ${index + 1}`,
      size: files[index]?.size || 0,
    }));
  }
  if (kind === 'video') {
    const selected = await new Promise<UniApp.ChooseVideoSuccess>((success, fail) =>
      uni.chooseVideo({ sourceType: ['album'], compressed: false, success, fail }),
    );
    return [
      {
        path: selected.tempFilePath,
        name: '参考视频',
        size: selected.size,
        width: selected.width,
        height: selected.height,
        durationMs: Math.round(selected.duration * 1000),
      },
    ];
  }
  if (isNativeApp()) return chooseNativeAudio(maxBytes);
  const selected = await new Promise<UniApp.ChooseMessageFileSuccessCallbackResult>(
    (success, fail) =>
      uni.chooseMessageFile({
        count: Math.min(9, count),
        type: 'file',
        extension: ['mp3', 'wav', 'm4a', 'aac', 'ogg', 'flac'],
        success,
        fail,
      }),
  );
  return selected.tempFiles.map((file) => ({ path: file.path, name: file.name, size: file.size }));
}
