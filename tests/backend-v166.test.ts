import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi } from '../src/api/auth';
import { resourceApi } from '../src/api/resources';
import { taskApi } from '../src/api/tasks';
import { cancelRequests, StaleRequestError } from '../src/core/http';
import { mediaAccess, saveMedia } from '../src/services/media';
import { resourceIdFromUrl } from '../src/core/urls';
import {
  verificationMethods,
  verificationContact,
  verificationCodes,
} from '../src/adapters/open-ai-canvas/auth-verification';
import {
  normalizeCatalog,
  defaultParameters,
  parameterFields,
} from '../src/adapters/open-ai-canvas/model-capabilities';
import { generationPayload } from '../src/adapters/open-ai-canvas/generation';
import { parseResult, canRetry, canRecoverMedia } from '../src/adapters/open-ai-canvas/task-result';
import { taskAssetOutputs } from '../src/adapters/open-ai-canvas/task-assets';
import type { Catalog, ResourceAccess, Task, VerificationPolicy } from '../src/types/backend';

vi.mock('../src/config/backend', () => ({
  backendConfig: { apiBaseUrl: 'https://tenant.test/api' },
}));
const values = new Map<string, unknown>();
const policy: VerificationPolicy = {
  smsLogin: false,
  emailLogin: false,
  smsRegistration: false,
  emailRegistration: true,
  smsAndEmailRegistration: false,
};
const access: ResourceAccess = {
  resourceId: 'r1',
  requestedVariant: 'playback',
  actualVariant: 'playback',
  url: '/api/public/resources/r1/file?signature=short-lived',
  delivery: 'platform-local',
  issuedAt: '2026-10-13T00:00:00Z',
  refreshAt: '2026-10-13T00:05:00Z',
  revision: 'r1-playback',
};
const task = (extra: Partial<Task> = {}): Task => ({
  id: 't1',
  type: 'canvas_video',
  status: 'failed',
  prompt: 'test',
  createdAt: '',
  updatedAt: '',
  ...extra,
});
function respond(data: unknown) {
  uni.request = vi.fn((options) => {
    queueMicrotask(() =>
      options?.success?.({ statusCode: 200, data: { code: 0, data }, header: {}, cookies: [] }),
    );
    return { abort: vi.fn() } as unknown as UniApp.RequestTask;
  });
}
beforeEach(() => {
  cancelRequests();
  values.clear();
  vi.stubGlobal('plus', undefined);
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => values.get(key),
    setStorageSync: (key: string, value: unknown) => values.set(key, value),
    removeStorageSync: (key: string) => values.delete(key),
  });
});

describe('v1.6.6 authentication', () => {
  it('uses the published verification policy and requires the combined method exclusively', () => {
    expect(verificationMethods(policy, 'register')).toEqual(['email']);
    expect(verificationMethods({ ...policy, smsRegistration: true }, 'register')).toEqual([
      'email',
      'sms',
    ]);
    expect(verificationMethods({ ...policy, smsAndEmailRegistration: true }, 'register')).toEqual([
      'sms_email',
    ]);
    expect(verificationMethods({ ...policy, emailRegistration: false }, 'register')).toEqual([]);
    expect(verificationMethods({ ...policy, smsLogin: true }, 'login')).toEqual(['sms']);
  });
  it('submits only contacts verified by the selected method', () => {
    expect(verificationContact('sms', 'unused@example.com', '+8613812345678')).toEqual({
      email: '',
      phone: '+8613812345678',
    });
    expect(verificationContact('email', ' User@Example.com ', 'unused')).toEqual({
      email: 'user@example.com',
      phone: '',
    });
    expect(() => verificationContact('sms_email', 'user@example.com', '')).toThrow('手机号');
    expect(() => verificationContact('email', 'invalid', '')).toThrow('邮箱');
  });
  it('validates both independently issued codes for combined registration', () => {
    expect(verificationCodes('sms_email', '123456', '654321')).toEqual({
      emailCode: '123456',
      smsCode: '654321',
    });
    expect(() => verificationCodes('sms_email', '123456', '')).toThrow('短信');
    expect(verificationCodes('sms', 'ignored', '654321')).toEqual({
      emailCode: '',
      smsCode: '654321',
    });
  });
  it('passes the verification ticket and explicit agreement acceptance to registration', async () => {
    respond({ user: { id: 'u1' } });
    const draft = {
      username: 'creator',
      displayName: '',
      password: 'password123',
      ...verificationContact('sms_email', 'user@example.com', '13812345678'),
      ...verificationCodes('sms_email', '123456', '654321'),
      ticket: 'test-ticket',
      acceptedTerms: true,
    };
    await authApi.register(draft);
    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://tenant.test/api/auth/register',
        method: 'POST',
        data: draft,
      }),
    );
    await authApi.verification({
      purpose: 'register',
      method: 'sms_email',
      email: draft.email,
      phone: draft.phone,
    });
    expect(uni.request).toHaveBeenLastCalledWith(
      expect.objectContaining({
        url: 'https://tenant.test/api/auth/verification',
        data: { purpose: 'register', method: 'sms_email', email: draft.email, phone: draft.phone },
      }),
    );
  });
});

describe('resource access and task recovery', () => {
  it('requests a playback descriptor through the new batch access endpoint', async () => {
    respond({ items: [{ resourceId: 'r1', access }] });
    expect(await mediaAccess({ kind: 'video', storageKey: 'resource:r1' })).toEqual({
      url: 'https://tenant.test/api/public/resources/r1/file?signature=short-lived',
      refreshAt: access.refreshAt,
    });
    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://tenant.test/api/resources/access',
        method: 'POST',
        data: [{ resourceId: 'r1', purpose: 'display', variant: 'playback' }],
      }),
    );
  });
  it('rejects per-resource failures even when the enclosing batch succeeds', async () => {
    respond({
      items: [
        { resourceId: 'r1', error: { code: 409, reason: 'resource_not_ready', msg: '资源未就绪' } },
      ],
    });
    await expect(resourceApi.url('r1')).rejects.toMatchObject({
      code: 409,
      reason: 'resource_not_ready',
    });
    respond({ items: [{ resourceId: 'other', access }] });
    await expect(resourceApi.url('r1')).rejects.toThrow('有效');
  });
  it('refreshes trusted stable resource URLs while keeping external media URLs external', async () => {
    respond({ items: [{ resourceId: 'r1', access: { ...access, actualVariant: 'thumbnail' } }] });
    expect(resourceIdFromUrl('/api/resources/r1/file')).toBe('r1');
    expect(resourceIdFromUrl('https://other.test/api/resources/r1/file')).toBeUndefined();
    await mediaAccess({ kind: 'image', url: '/api/resources/r1/file' }, 'display', 'thumbnail');
    expect(uni.request).toHaveBeenCalledTimes(1);
    expect(await mediaAccess({ kind: 'image', url: 'https://cdn.test/image.png' })).toEqual({
      url: 'https://cdn.test/image.png',
    });
    expect(uni.request).toHaveBeenCalledTimes(1);
  });
  it('downloads the original and sends no session cookie to the media URL', async () => {
    values.set('oac:https%3A%2F%2Ftenant.test%2Fapi:session', {
      value: 'session-value',
      expiresAt: Date.now() + 60000,
    });
    respond({
      items: [
        {
          resourceId: 'r1',
          access: {
            ...access,
            requestedVariant: 'original',
            actualVariant: 'original',
            url: 'https://cdn.test/original.mp4',
          },
        },
      ],
    });
    uni.downloadFile = vi.fn((options) => {
      queueMicrotask(() => options.success?.({ statusCode: 200, tempFilePath: 'temp.mp4' }));
      return {} as UniApp.DownloadTask;
    });
    uni.saveVideoToPhotosAlbum = vi.fn((options) => {
      options.success?.({ errMsg: 'ok' });
    });
    await saveMedia({ kind: 'video', storageKey: 'resource:r1' });
    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [{ resourceId: 'r1', purpose: 'download', variant: 'original' }],
      }),
    );
    expect(uni.downloadFile).toHaveBeenCalledWith(
      expect.objectContaining({ url: 'https://cdn.test/original.mp4' }),
    );
    expect(vi.mocked(uni.downloadFile).mock.calls[0][0]).not.toHaveProperty('header');
    expect(uni.saveVideoToPhotosAlbum).toHaveBeenCalled();
  });
  it('discards resource descriptors received after the session changes', async () => {
    let finish: ((value: UniApp.RequestSuccessCallbackResult) => void) | undefined;
    uni.request = vi.fn((options) => {
      finish = options?.success;
      return { abort: vi.fn() } as unknown as UniApp.RequestTask;
    });
    const pending = resourceApi.url('r1');
    cancelRequests();
    finish?.({
      statusCode: 200,
      data: { code: 0, data: { items: [{ resourceId: 'r1', access }] } },
      header: {},
      cookies: [],
      errMsg: 'ok',
    });
    await expect(pending).rejects.toBeInstanceOf(StaleRequestError);
  });
  it('recovers the original task without calling generation or retry', async () => {
    respond(task({ status: 'queued' }));
    const recoverable = task({ canRecoverMedia: true, mediaStage: 'upload' });
    expect(canRecoverMedia(recoverable)).toBe(true);
    expect(canRetry(recoverable)).toBe(false);
    await taskApi.recover(recoverable.id);
    expect(uni.request).toHaveBeenCalledTimes(1);
    expect(uni.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: 'https://tenant.test/api/tasks/t1/recover-media',
        method: 'POST',
      }),
    );
    expect(canRetry(task({ providerCancelStatus: 'requested' }))).toBe(false);
    expect(canRetry(task({ billing: { status: 'uncertain', amountMicrocredits: 1 } }))).toBe(false);
    expect(canRetry(task({ agentRunId: 'agent' }))).toBe(false);
    expect(canRetry(task({ inputJson: '{"metadata":{"source":"cloud_agent"}}' }))).toBe(false);
    expect(canRetry(task({ inputJson: '{' }))).toBe(false);
    expect(canRetry(task({ status: 'cancelled' }))).toBe(true);
  });
});

describe('new generation contracts', () => {
  const catalog: Catalog = {
    source: 'system',
    models: [],
    channels: [
      {
        id: 'c1',
        name: '',
        models: [
          {
            id: 'm1',
            modelKey: 'video-model',
            displayName: 'Video',
            capability: 'video',
            protocol: 'video-protocol',
            available: true,
            defaultOptions: { videoSeconds: 10, vquality: '1080p' },
            capabilityConfig: {
              video: {
                references: { maxImages: 2, maxImageBytes: 1024, promptMaxChars: 8000 },
                duration: { values: [5, 10], default: 5 },
                ratios: ['16:9'],
                defaultRatio: '16:9',
                resolutions: ['720p', '1080p'],
                defaultResolution: '720p',
                operations: ['text_to_video', 'image_to_video'],
                generateAudio: { supported: true, default: true },
                watermark: { supported: false, default: false },
              },
            },
          },
        ],
      },
    ],
  };
  it('uses the server-selected billable defaults and string-valued execution controls', () => {
    const model = normalizeCatalog(catalog)[0];
    const options = defaultParameters(model);
    expect(options).toMatchObject({
      videoSeconds: 10,
      vquality: '1080p',
      videoGenerateAudio: true,
    });
    expect(
      parameterFields(model).find((field) => field.key === 'videoGenerateAudio')?.labels,
    ).toEqual(['关闭', '开启']);
    expect(options).not.toHaveProperty('videoWatermark');
    const payload = generationPayload(model, 'test', [], options);
    expect(payload.input.config).toMatchObject({
      videoSeconds: '10',
      videoGenerateAudio: 'true',
      channelId: 'c1',
    });
    expect(payload.input.config).not.toHaveProperty('count');
    expect(payload).not.toHaveProperty('logicalModelId');
  });
  it('disables upstream streaming when declared unsupported', () => {
    const models = normalizeCatalog({
      source: 'system',
      channels: [
        {
          id: 'c1',
          name: '',
          models: [
            {
              id: 'text1',
              modelKey: 'text-model',
              displayName: '',
              available: true,
              capability: 'text',
              protocol: 'text-protocol',
              capabilityConfig: {
                text: {
                  streaming: false,
                  references: { maxImages: 0, maxImageBytes: 0, promptMaxChars: 1000 },
                },
              },
            },
          ],
        },
      ],
    });
    expect(generationPayload(models[0], 'test', [], {}).input.textOptions?.stream).toBe(false);
  });
  it('keeps declared custom image presets and explicit transparent-background controls usable', () => {
    const model = normalizeCatalog({
      source: 'system',
      channels: [
        {
          id: 'c1',
          name: '',
          models: [
            {
              id: 'image1',
              modelKey: 'image-model',
              displayName: '',
              available: true,
              capability: 'image',
              protocol: 'image-protocol',
              defaultOptions: { size: '2048x2048' },
              capabilityConfig: {
                image: {
                  references: { maxImages: 1, maxImageBytes: 1024, promptMaxChars: 1000 },
                  size: {
                    parameter: 'size',
                    values: ['*'],
                    default: '2048x2048',
                    allowCustom: true,
                    presets: [
                      { tier: '2k', ratio: '1:1', size: '2048x2048', width: 2048, height: 2048 },
                    ],
                  },
                  quality: { supported: false, values: [], default: '' },
                  transparentBackground: { supported: true, default: true },
                  maxOutputs: 1,
                },
              },
            },
          ],
        },
      ],
    })[0];
    const options = defaultParameters(model);
    expect(options).toMatchObject({ size: '2048x2048', transparentBackground: true, count: 1 });
    expect(parameterFields(model).find((field) => field.key === 'size')?.labels).toContain(
      '2K · 1:1 · 2048x2048',
    );
    const payload = generationPayload(model, 'test', [], options);
    expect(payload.input.config).toMatchObject({ count: '1', transparentBackground: 'true' });
    expect(payload.input.config).not.toHaveProperty('quality');
  });
  it.each([
    [{ content: [{ type: 'output_text', text: '你好' }, { text: '世界' }] }, '你好世界'],
    [{ title: '结构化内容', items: [1, 2] }, '{"title":"结构化内容","items":[1,2]}'],
  ])('preserves structured text in both preview and library synchronization', (text, expected) => {
    const completed = task({
      type: 'canvas_text',
      status: 'succeeded',
      resultJson: JSON.stringify({ text }),
    });
    expect(parseResult(completed).text).toBe(expected);
    expect(taskAssetOutputs(completed)).toEqual([{ index: 0, kind: 'text', content: expected }]);
  });
});
