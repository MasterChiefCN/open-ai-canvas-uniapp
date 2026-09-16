import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  upload: vi.fn(),
  url: vi.fn(),
  dimensions: vi.fn(),
  values: new Map<string, unknown>(),
  resets: [] as Array<() => void>,
  epoch: 1,
  user: { id: 'alice' } as { id: string } | null,
}));
vi.mock('../src/api/assets', () => ({ assetApi: { get: mocks.get, put: mocks.put } }));
vi.mock('../src/api/resources', () => ({ resourceApi: { upload: mocks.upload, url: mocks.url } }));
vi.mock('../src/services/asset-sync', () => ({ mediaDimensions: mocks.dimensions }));
vi.mock('../src/stores/auth', () => ({
  useAuth: () => ({ user: mocks.user }),
  onSessionReset: (fn: () => void) => mocks.resets.push(fn),
}));
vi.mock('../src/core/storage', () => ({
  storage: {
    userKey: (user: string, key: string) => `${user}:${key}`,
    get: (key: string) => mocks.values.get(key),
    set: (key: string, value: unknown) => mocks.values.set(key, value),
  },
}));
vi.mock('../src/core/http', async (original) => ({
  ...(await original<typeof import('../src/core/http')>()),
  requestEpoch: () => mocks.epoch,
  assertEpoch: (epoch: number) => {
    if (epoch !== mocks.epoch) throw new Error('stale');
  },
}));
vi.mock('../src/config/backend', () => ({
  backendConfig: { apiBaseUrl: 'https://tenant.test/api' },
}));
import {
  uploadReference,
  syncReferenceAsset,
  referenceUploadStates,
  resumeReferenceAssets,
  referenceAssetId,
} from '../src/services/reference-upload';
import { ApiError } from '../src/core/http';
import type { MediaKind } from '../src/types/backend';
beforeEach(() => {
  mocks.resets.forEach((reset) => reset());
  vi.resetAllMocks();
  mocks.values.clear();
  mocks.epoch = 1;
  mocks.user = { id: 'alice' };
  mocks.get.mockResolvedValue(undefined);
  mocks.put.mockResolvedValue({});
  mocks.upload.mockImplementation(async (_path, kind) => ({
    resource: {
      id: 'r1',
      kind,
      status: 'ready',
      mimeType: `${kind}/${kind === 'image' ? 'png' : kind === 'video' ? 'mp4' : 'mpeg'}`,
      size: 4096,
      ...(kind !== 'audio' ? { width: 1280, height: 720 } : {}),
      durationMs: 3000,
    },
  }));
});
describe('reference upload library synchronization', () => {
  it.each<MediaKind>(['image', 'video', 'audio'])(
    'saves %s immediately without a generation task',
    async (kind) => {
      await uploadReference('wxfile://temp', kind, 'reference');
      expect(mocks.upload).toHaveBeenCalledWith('wxfile://temp', kind, {});
      const asset = mocks.put.mock.calls[0][0];
      expect(asset).toMatchObject({
        id: referenceAssetId('r1'),
        kind,
        title: 'reference',
        status: 'confirmed',
        metadata: { source: 'create-upload' },
        data: { storageKey: 'resource:r1', bytes: 4096 },
      });
      expect(asset.data[kind === 'image' ? 'dataUrl' : 'url']).toBe(
        'https://tenant.test/api/resources/r1/file',
      );
      expect(JSON.stringify(asset)).not.toContain('wxfile:');
      if (kind === 'audio') expect(asset.data).not.toHaveProperty('width');
      expect(referenceUploadStates.r1.status).toBe('synced');
      expect(mocks.values.get('alice:reference-asset-pending')).toEqual([]);
    },
  );
  it('keeps an uploaded resource usable and retries only library writes', async () => {
    mocks.put.mockRejectedValueOnce(new Error('offline'));
    const resource = await uploadReference('temp', 'image', 'reference');
    expect(resource.id).toBe('r1');
    expect(referenceUploadStates.r1.status).toBe('error');
    expect(mocks.values.get('alice:reference-asset-pending')).toHaveLength(1);
    await syncReferenceAsset(referenceUploadStates.r1);
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(mocks.put).toHaveBeenCalledTimes(2);
    expect(referenceUploadStates.r1.status).toBe('synced');
  });
  it('reconciles an ambiguous PUT without overwriting an edited existing asset', async () => {
    mocks.put.mockRejectedValueOnce(new Error('timeout'));
    await uploadReference('temp', 'video', 'reference');
    mocks.get.mockResolvedValue({ id: referenceAssetId('r1'), title: 'web edited' });
    await syncReferenceAsset(referenceUploadStates.r1);
    expect(mocks.put).toHaveBeenCalledTimes(1);
    expect(referenceUploadStates.r1.status).toBe('synced');
  });
  it('restores pending work after restart without reuploading', async () => {
    mocks.put.mockRejectedValueOnce(new Error('offline'));
    await uploadReference('temp', 'audio', 'reference');
    mocks.resets.forEach((reset) => reset());
    await resumeReferenceAssets();
    expect(mocks.upload).toHaveBeenCalledTimes(1);
    expect(referenceUploadStates.r1.status).toBe('synced');
  });
  it('deduplicates concurrent retries', async () => {
    mocks.put.mockRejectedValueOnce(new Error('offline'));
    await uploadReference('temp', 'image', 'reference');
    await Promise.all([
      syncReferenceAsset(referenceUploadStates.r1),
      syncReferenceAsset(referenceUploadStates.r1),
    ]);
    expect(mocks.put).toHaveBeenCalledTimes(2);
  });
  it('does not create library records when upload fails', async () => {
    mocks.upload.mockRejectedValue(new Error('domain blocked'));
    await expect(uploadReference('temp', 'image', 'reference')).rejects.toThrow('domain blocked');
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('does not write under another account after an in-flight GET', async () => {
    mocks.get.mockImplementation(async () => {
      mocks.epoch++;
      mocks.user = { id: 'bob' };
      mocks.resets.forEach((reset) => reset());
    });
    await expect(uploadReference('temp', 'image', 'reference')).rejects.toThrow('stale');
    expect(mocks.put).not.toHaveBeenCalled();
    expect(referenceUploadStates).toEqual({});
    expect(mocks.values.has('bob:reference-asset-pending')).toBe(false);
  });
  it('rejects a mismatched resource without losing its pending record', async () => {
    mocks.upload.mockResolvedValue({
      resource: { id: 'r1', kind: 'video', mimeType: 'video/mp4', size: 1 },
    });
    await uploadReference('temp', 'audio', 'reference');
    expect(mocks.put).not.toHaveBeenCalled();
    expect(referenceUploadStates.r1.message).toContain('类型不匹配');
  });
  it('resolves missing dimensions, refusing invalid Web assets', async () => {
    mocks.upload.mockResolvedValue({ resource: { id: 'r1', mimeType: 'image/png', size: 1 } });
    mocks.url.mockResolvedValue({ url: 'https://cdn.test/signed' });
    mocks.dimensions.mockResolvedValue({ width: 0, height: 0 });
    await uploadReference('temp', 'image', 'reference');
    expect(mocks.put).not.toHaveBeenCalled();
    mocks.dimensions.mockResolvedValue({ width: 800, height: 600 });
    await syncReferenceAsset(referenceUploadStates.r1);
    expect(mocks.put.mock.calls[0][0].data.width).toBe(800);
    expect(JSON.stringify(mocks.values.get('alice:reference-asset-pending'))).not.toContain(
      'signed',
    );
  });
  it('respects rate limits on manual retry', async () => {
    mocks.get.mockRejectedValueOnce(new ApiError('rate limit', 429, 429, undefined, 60000));
    await uploadReference('temp', 'audio', 'reference');
    await syncReferenceAsset(referenceUploadStates.r1);
    expect(mocks.get).toHaveBeenCalledTimes(1);
    expect(referenceUploadStates.r1.status).toBe('error');
  });
});
