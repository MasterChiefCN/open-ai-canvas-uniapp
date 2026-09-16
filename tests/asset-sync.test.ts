import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { createPinia, setActivePinia } from 'pinia';
const mocks = vi.hoisted(() => ({
  get: vi.fn(),
  put: vi.fn(),
  task: vi.fn(),
  list: vi.fn(),
  resource: vi.fn(),
  importUrl: vi.fn(),
  url: vi.fn(),
  values: new Map<string, unknown>(),
  resets: [] as Array<() => void>,
  epoch: 1,
  user: { id: 'alice' },
}));
vi.mock('../src/api/assets', () => ({ assetApi: { get: mocks.get, put: mocks.put } }));
vi.mock('../src/api/tasks', () => ({ taskApi: { get: mocks.task, list: mocks.list } }));
vi.mock('../src/api/resources', () => ({
  resourceApi: { get: mocks.resource, importUrl: mocks.importUrl, url: mocks.url },
}));
vi.mock('../src/stores/auth', () => ({
  useAuth: () => ({ user: mocks.user }),
  onSessionReset: (fn: () => void) => mocks.resets.push(fn),
}));
vi.mock('../src/stores/wallet', () => ({ useWallet: () => ({ balance: async () => {} }) }));
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
  backendConfig: { apiBaseUrl: 'https://tenant.test/custom/api' },
}));
import { assetSyncStates, syncTaskAssets } from '../src/services/asset-sync';
import {
  generationAssetIdentity,
  taskAssetOutputs,
} from '../src/adapters/open-ai-canvas/task-assets';
import { sha256 } from '../src/core/sha256';
import { ApiError } from '../src/core/http';
import { useTasks } from '../src/stores/tasks';
import { watchTasks, unwatchTasks } from '../src/services/task-polling';
import type { Task } from '../src/types/backend';
const completed = (patch: Partial<Task> = {}): Task => ({
  id: 'task-1',
  type: 'canvas_image',
  status: 'succeeded',
  prompt: '雨后山茶花',
  createdAt: '2026-09-16T10:00:00Z',
  updatedAt: '2026-09-16T10:01:00Z',
  inputJson: JSON.stringify({ metadata: { source: 'uniapp-wechat' } }),
  resultJson: JSON.stringify({ images: [{ storageKey: 'resource:image-1' }] }),
  ...patch,
});
beforeEach(() => {
  mocks.resets.forEach((fn) => fn());
  vi.resetAllMocks();
  mocks.values.clear();
  mocks.epoch = 1;
  mocks.user = { id: 'alice' };
  setActivePinia(createPinia());
  mocks.get.mockResolvedValue(undefined);
  mocks.put.mockResolvedValue({ asset: { id: 'saved' } });
  mocks.task.mockResolvedValue(completed());
  mocks.list.mockResolvedValue([]);
  mocks.resource.mockImplementation(async (id: string) => ({
    resource: {
      id,
      status: 'ready',
      width: 1920,
      height: 1080,
      size: 123,
      mimeType: id.includes('video') ? 'video/mp4' : 'image/png',
      durationMs: 5000,
    },
  }));
  vi.stubGlobal('uni', { getImageInfo: vi.fn(), getVideoInfo: vi.fn() });
});

describe('Web-compatible generation asset identity', () => {
  it.each([
    '',
    'abc',
    'a'.repeat(56),
    'a'.repeat(64),
    'a'.repeat(1000),
    '中文 🎨',
    'materialize:task-1:0',
  ])('matches SHA-256 for %s', (value) => {
    expect(sha256(value)).toBe(createHash('sha256').update(value).digest('hex'));
  });
  it('matches the upstream generation_ + SHA256(materialize:taskId:index) contract', () => {
    expect(generationAssetIdentity('task-1', 0)).toEqual({
      effectKey: 'materialize:task-1:0',
      id: 'generation_' + createHash('sha256').update('materialize:task-1:0').digest('hex'),
    });
    expect(generationAssetIdentity('task-1', 1).id).not.toBe(
      generationAssetIdentity('task-1', 0).id,
    );
  });
});
describe('task to personal library synchronization', () => {
  it('creates every image with stable resource URLs and complete media metadata', async () => {
    const task = completed({
      resultJson: JSON.stringify({
        images: [{ storageKey: 'resource:image-1' }, { storageKey: 'resource:image-2' }],
      }),
    });
    await syncTaskAssets(task);
    expect(mocks.put).toHaveBeenCalledTimes(2);
    expect(mocks.put.mock.calls[1][0]).toMatchObject({
      id: generationAssetIdentity(task.id, 1).id,
      kind: 'image',
      status: 'confirmed',
      title: '雨后山茶花',
      metadata: { taskId: task.id, outputIndex: 1, generationEffectKey: 'materialize:task-1:1' },
      data: {
        dataUrl: 'https://tenant.test/custom/api/resources/image-2/file',
        storageKey: 'resource:image-2',
        width: 1920,
        height: 1080,
        bytes: 123,
        mimeType: 'image/png',
      },
    });
    expect(mocks.importUrl).not.toHaveBeenCalled();
    expect(assetSyncStates[task.id].status).toBe('synced');
  });
  it('writes video and text using the upstream data schema', async () => {
    await syncTaskAssets(
      completed({
        id: 'video',
        type: 'canvas_video',
        resultJson: '{"video":{"storageKey":"resource:video-1"}}',
      }),
    );
    await syncTaskAssets(
      completed({ id: 'text', type: 'canvas_text', resultJson: '{"text":"完整生成正文"}' }),
    );
    expect(mocks.put.mock.calls[0][0]).toMatchObject({
      kind: 'video',
      data: {
        url: 'https://tenant.test/custom/api/resources/video-1/file',
        durationMs: 5000,
        mimeType: 'video/mp4',
      },
    });
    expect(mocks.put.mock.calls[1][0]).toMatchObject({
      kind: 'text',
      data: { content: '完整生成正文' },
    });
  });
  it('loads full results when a task finished in the background and only a summary is available', async () => {
    await syncTaskAssets(completed({ inputJson: undefined, resultJson: undefined }));
    expect(mocks.task).toHaveBeenCalledWith('task-1');
    expect(mocks.put).toHaveBeenCalledOnce();
  });
  it('deduplicates concurrent completion notifications, refreshes and persisted success markers', async () => {
    await Promise.all([syncTaskAssets(completed()), syncTaskAssets(completed())]);
    await syncTaskAssets(completed(), false, true);
    delete assetSyncStates['task-1'];
    await syncTaskAssets(completed());
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(mocks.get).toHaveBeenCalledOnce();
  });
  it('preserves an existing Web asset without overwriting its title, folder or metadata', async () => {
    mocks.get.mockResolvedValue({
      id: generationAssetIdentity('task-1', 0).id,
      title: '用户已改名',
      folderId: 'folder',
    });
    await syncTaskAssets(completed());
    expect(mocks.put).not.toHaveBeenCalled();
    expect(mocks.resource).not.toHaveBeenCalled();
    expect(assetSyncStates['task-1'].status).toBe('synced');
  });
  it('reconciles a partial timeout on retry instead of duplicating accepted assets', async () => {
    const persisted = new Map();
    mocks.get.mockImplementation(async (id) => persisted.get(id));
    mocks.put.mockImplementation(async (asset) => {
      persisted.set(asset.id, asset);
      if (persisted.size === 2) throw new Error('timeout after server commit');
      return { asset };
    });
    const task = completed({
      resultJson:
        '{"images":[{"storageKey":"resource:image-1"},{"storageKey":"resource:image-2"}]}',
    });
    await syncTaskAssets(task);
    expect(assetSyncStates[task.id].status).toBe('error');
    await syncTaskAssets(task, false, true);
    expect(mocks.put).toHaveBeenCalledTimes(2);
    expect(assetSyncStates[task.id].status).toBe('synced');
  });
  it('does not create assets for foreign, failed, active or unsupported tasks', async () => {
    await syncTaskAssets(completed({ inputJson: '{"metadata":{"source":"create-page"}}' }));
    await syncTaskAssets(completed({ id: 'failed', status: 'failed' }));
    await syncTaskAssets(completed({ id: 'running', status: 'running' }));
    await syncTaskAssets(completed({ id: 'other', type: 'agent' }));
    expect(mocks.put).not.toHaveBeenCalled();
  });
  it('isolates malformed output errors without marking the generation itself as failed', async () => {
    const task = completed({ resultJson: '{broken' });
    await syncTaskAssets(task);
    expect(task.status).toBe('succeeded');
    expect(assetSyncStates[task.id].status).toBe('error');
    expect(mocks.put).not.toHaveBeenCalled();
    expect(() => taskAssetOutputs(completed({ resultJson: '{"images":[null]}' }))).toThrow();
  });
  it('does not treat an asset lookup network failure as a missing asset', async () => {
    mocks.get.mockRejectedValue(new Error('offline'));
    await syncTaskAssets(completed());
    expect(mocks.put).not.toHaveBeenCalled();
    expect(assetSyncStates['task-1'].status).toBe('error');
  });
  it('honors rate limit retry time and does not loop on refresh', async () => {
    mocks.put.mockRejectedValue(new ApiError('限流', 429, 429, undefined, 60000));
    await syncTaskAssets(completed());
    await syncTaskAssets(completed(), false, true);
    expect(mocks.put).toHaveBeenCalledOnce();
    expect(assetSyncStates['task-1'].retryAt).toBeGreaterThan(Date.now());
  });
  it('imports a legacy remote result with a stable idempotency key before referencing it', async () => {
    mocks.importUrl.mockResolvedValue({
      resource: {
        id: 'imported',
        status: 'ready',
        width: 800,
        height: 600,
        size: 100,
        mimeType: 'image/jpeg',
      },
    });
    await syncTaskAssets(
      completed({ resultJson: '{"images":[{"dataUrl":"https://cdn.test/one.jpg"}]}' }),
    );
    expect(mocks.importUrl).toHaveBeenCalledWith(
      'https://cdn.test/one.jpg',
      'image',
      generationAssetIdentity('task-1', 0).id,
    );
    expect(mocks.put.mock.calls[0][0].data.storageKey).toBe('resource:imported');
  });
  it('reads real image dimensions when the backend resource lacks them', async () => {
    mocks.resource.mockResolvedValue({
      resource: { id: 'image-1', size: 123, mimeType: 'image/png' },
    });
    mocks.url.mockResolvedValue({ url: 'https://cdn.test/signed' });
    vi.mocked(uni.getImageInfo).mockImplementation((options: any) =>
      options.success({ width: 640, height: 480 }),
    );
    await syncTaskAssets(completed());
    expect(mocks.put.mock.calls[0][0].data).toMatchObject({ width: 640, height: 480 });
    expect(JSON.stringify(mocks.put.mock.calls[0][0])).not.toContain('signed');
  });
  it('does not write old-account assets when the session changes during resource lookup', async () => {
    mocks.resource.mockImplementation(async () => {
      mocks.epoch++;
      mocks.user = { id: 'bob' };
      mocks.resets.forEach((fn) => fn());
      return {
        resource: { id: 'image-1', width: 800, height: 600, mimeType: 'image/png', size: 1 },
      };
    });
    await syncTaskAssets(completed());
    expect(mocks.put).not.toHaveBeenCalled();
    expect(assetSyncStates['task-1']).toBeUndefined();
    expect(mocks.values.size).toBe(0);
  });
  it('runs for store refresh summaries and keeps cached full task results', async () => {
    const store = useTasks();
    store.remember(completed());
    await syncTaskAssets(completed());
    mocks.list
      .mockResolvedValueOnce([completed({ inputJson: undefined, resultJson: undefined })])
      .mockResolvedValueOnce([]);
    await store.refresh();
    // Real JSON summaries omit the properties instead of setting undefined.
    const { inputJson: _input, resultJson: _result, ...summary } = completed();
    store.put(completed());
    store.put(summary);
    expect(store.items['task-1'].resultJson).toBe(completed().resultJson);
    expect(mocks.put).toHaveBeenCalledOnce();
  });
  it('automatically reconciles completed summaries after restarting the task page', async () => {
    const { inputJson: _input, resultJson: _result, ...summary } = completed();
    mocks.list.mockResolvedValueOnce([summary]).mockResolvedValueOnce([]);
    await useTasks().refresh();
    await syncTaskAssets(summary);
    expect(mocks.task).toHaveBeenCalledOnce();
    expect(mocks.put).toHaveBeenCalledOnce();
  });
  it('automatically syncs when the shared poller observes generation completion', async () => {
    vi.useFakeTimers();
    try {
      useTasks().remember(completed({ status: 'running', resultJson: undefined }));
      watchTasks('test', ['task-1']);
      await vi.advanceTimersByTimeAsync(2200);
      await syncTaskAssets(completed());
      expect(useTasks().items['task-1'].status).toBe('succeeded');
      expect(mocks.put).toHaveBeenCalledOnce();
      expect(assetSyncStates['task-1'].status).toBe('synced');
    } finally {
      unwatchTasks('test');
      vi.useRealTimers();
    }
  });
});
