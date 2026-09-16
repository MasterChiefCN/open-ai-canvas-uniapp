import { describe, it, expect, vi, beforeEach } from 'vitest';
import { apiUrl, configurationError, resourceUrl } from '../src/core/urls';
import {
  parseSessionCookies,
  cookieHeader,
  receiveCookies,
  clearCookie,
} from '../src/core/session';
import {
  ApiError,
  unwrap,
  request,
  upload,
  cancelRequests,
  setUnauthorizedHandler,
  StaleRequestError,
} from '../src/core/http';
import { storage } from '../src/core/storage';
import { formatCredits } from '../src/core/credits';
vi.mock('../src/config/backend', () => ({
  backendConfig: { apiBaseUrl: 'https://tenant.test/api' },
}));
const values = new Map<string, unknown>();
beforeEach(() => {
  values.clear();
  cancelRequests();
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => values.get(key),
    setStorageSync: (key: string, value: unknown) => values.set(key, value),
    removeStorageSync: (key: string) => values.delete(key),
    getStorageInfoSync: () => ({ keys: [...values.keys()] }),
  });
});
describe('API and resource URLs', () => {
  it('rejects placeholder, HTTP and trailing slash configuration', () => {
    expect(configurationError('https://your-domain.example/api')).toContain('请配置');
    expect(configurationError('http://tenant.test/api')).not.toBe('');
    expect(configurationError('https://tenant.test/api/')).not.toBe('');
    expect(configurationError('https://tenant.test/service/api')).toBe('');
  });
  it('keeps API-relative and root-relative resources distinct', () => {
    expect(apiUrl('/tasks')).toBe('https://tenant.test/api/tasks');
    expect(resourceUrl('/api/resources/1')).toBe('https://tenant.test/api/resources/1');
    expect(resourceUrl('resources/1')).toBe('https://tenant.test/api/resources/1');
    expect(resourceUrl('https://cdn.test/item?signature=test')).toBe(
      'https://cdn.test/item?signature=test',
    );
  });
  it('cannot turn a business path into an external request', () => {
    for (const value of ['https://evil.test', '//evil.test', '/../outside', '/foo\\bar'])
      expect(() => apiUrl(value)).toThrow();
    for (const value of ['http://cdn.test/item', '//cdn.test/item', 'data:image/png;base64,x'])
      expect(() => resourceUrl(value)).toThrow();
  });
});
describe('session cookie and storage', () => {
  it('extracts only the session cookie and honors Expires with commas', () => {
    expect(
      parseSessionCookies(
        [
          'other=ignore; Path=/, open_ai_canvas_session=abc=def; Expires=Wed, 21 Oct 2037 07:28:00 GMT; HttpOnly',
        ],
        1000,
      ),
    ).toEqual({
      value: 'abc=def',
      expiresAt: Date.parse('2037-10-21T07:28:00Z'),
    });
  });
  it('Max-Age overrides Expires and deletion wins', () => {
    expect(
      parseSessionCookies(
        ['open_ai_canvas_session=a; Expires=Wed, 21 Oct 2037 07:28:00 GMT; Max-Age=0'],
        1000,
      ),
    ).toBeNull();
    expect(parseSessionCookies(['open_ai_canvas_session=a; Max-Age=60'], 1000)).toEqual({
      value: 'a',
      expiresAt: 61000,
    });
    expect(parseSessionCookies(['other=a'])).toBeUndefined();
    expect(parseSessionCookies(['open_ai_canvas_session=a', 'open_ai_canvas_session='])).toBeNull();
  });
  it('does not send attributes or unrelated cookies', () => {
    receiveCookies([], {
      'SET-COOKIE': ['foo=x', 'open_ai_canvas_session=token; HttpOnly; Secure; Path=/'],
    });
    expect(cookieHeader()).toEqual({ Cookie: 'open_ai_canvas_session=token' });
    clearCookie();
    expect(cookieHeader()).toEqual({});
  });
  it('drops expired cookies on restoration', () => {
    storage.set('session', { value: 'old', expiresAt: Date.now() - 1 });
    expect(cookieHeader()).toEqual({});
    expect(storage.get('session')).toBeUndefined();
  });
  it('isolates account caches and keeps other instances untouched', () => {
    storage.set(storage.userKey('alice', 'draft'), 'alice draft');
    storage.set(storage.userKey('bob', 'draft'), 'bob draft');
    values.set('oac:other-instance:user:alice:draft', 'other');
    storage.clearUser('alice');
    expect(storage.get(storage.userKey('alice', 'draft'))).toBeUndefined();
    expect(storage.get(storage.userKey('bob', 'draft'))).toBe('bob draft');
    expect(values.get('oac:other-instance:user:alice:draft')).toBe('other');
    expect(
      [...values.keys()].some((key) => key.startsWith('oac:https%3A%2F%2Ftenant.test%2Fapi:')),
    ).toBe(true);
  });
});
describe('response handling', () => {
  it('only resolves code zero envelopes', () => {
    expect(unwrap({ code: 0, data: { id: 'task' } }, 200)).toEqual({
      id: 'task',
    });
    expect(() => unwrap({ code: 400, msg: '业务错误' }, 200)).toThrow('业务错误');
    expect(() => unwrap('<html>proxy</html>', 502)).toThrow('非 JSON');
    expect(() => unwrap({ code: 0, data: 1 }, 500)).toThrow();
  });
  it('retains reason and Retry-After', () => {
    try {
      unwrap({ code: 429, msg: '限流', reason: 'rate_limit' }, 429, {
        'Retry-After': '12',
      });
      throw new Error('expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(ApiError);
      expect(error).toMatchObject({
        retryAfterMs: 12000,
        reason: 'rate_limit',
      });
    }
  });
  it('aborts and rejects old responses before reading cookies', async () => {
    let callback: any;
    const abort = vi.fn();
    uni.request = vi.fn((options) => {
      callback = options;
      return { abort };
    }) as any;
    const pending = request('/tasks');
    const check = expect(pending).rejects.toBeInstanceOf(StaleRequestError);
    cancelRequests();
    callback.success({
      data: { code: 0, data: [] },
      statusCode: 200,
      cookies: ['open_ai_canvas_session=old'],
      header: {},
    });
    await check;
    expect(abort).toHaveBeenCalledOnce();
    expect(cookieHeader()).toEqual({});
  });
  it('never retries ambiguous write failures', async () => {
    uni.request = vi.fn((options) => {
      queueMicrotask(() => options?.fail?.({ errMsg: 'timeout' }));
      return { abort() {} };
    }) as any;
    await expect(request('/wallet/redeem', 'POST', { code: 'test-only' })).rejects.toThrow(
      '提交结果未知',
    );
    expect(uni.request).toHaveBeenCalledOnce();
  });
  it('uses the same session and envelope parser for uploads', async () => {
    receiveCookies(['open_ai_canvas_session=test']);
    uni.uploadFile = vi.fn((options) => {
      queueMicrotask(() =>
        options?.success?.({
          statusCode: 200,
          data: JSON.stringify({ code: 0, data: { resource: { id: 'r' } } }),
          errMsg: '',
        }),
      );
      return { abort() {} };
    }) as any;
    await expect(upload('/tmp/image')).resolves.toEqual({
      resource: { id: 'r' },
    });
    expect(uni.uploadFile).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'file',
        header: { Cookie: 'open_ai_canvas_session=test' },
        url: 'https://tenant.test/api/resources',
      }),
    );
  });
  it('notifies authentication failure without retrying the request', async () => {
    const handler = vi.fn();
    setUnauthorizedHandler(handler);
    uni.request = vi.fn((options) => {
      queueMicrotask(() =>
        options?.success?.({
          statusCode: 401,
          data: { code: 401, msg: '会话失效' },
          header: {},
          cookies: [],
          errMsg: '',
        }),
      );
      return { abort() {} };
    }) as any;
    await expect(request('/tasks')).rejects.toThrow('会话失效');
    expect(handler).toHaveBeenCalledOnce();
  });
});
describe('microcredit formatting', () => {
  it.each([
    [1, '0.000001'],
    [1234567, '1.234567'],
    [-1000100, '-1.0001'],
    [1000000, '1'],
    [0, '0'],
  ])('formats %s without losing integer precision', (value, result) => {
    expect(formatCredits(value as number)).toBe(result);
  });
  it('does not invent balances for invalid amounts', () => {
    expect(formatCredits(NaN)).toBe('—');
    expect(formatCredits(0.1)).toBe('—');
  });
});
