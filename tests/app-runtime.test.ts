import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { clientSource, audioPickerHint, albumPermissionMessage } from '../src/core/runtime';
import { cookieHeader, clearCookie, receiveCookies } from '../src/core/session';
import { isUniAppTask } from '../src/adapters/open-ai-canvas/task-assets';
import type { Task } from '../src/types/backend';

vi.mock('../src/config/backend', () => ({
  backendConfig: { apiBaseUrl: 'https://tenant.test/api' },
}));
const values = new Map<string, unknown>();
beforeEach(() => {
  values.clear();
  vi.stubGlobal('uni', {
    getStorageSync: (key: string) => values.get(key),
    setStorageSync: (key: string, value: unknown) => values.set(key, value),
    removeStorageSync: (key: string) => values.delete(key),
  });
});
afterEach(() => vi.unstubAllGlobals());

it.each(['Android', 'iOS'])('uses explicit cookies and clears the %s native cookie jar', (name) => {
  const removeAllCookie = vi.fn();
  vi.stubGlobal('plus', { os: { name }, navigator: { removeAllCookie } });
  expect(clientSource()).toBe('uniapp-app');
  expect(audioPickerHint()).toContain('系统文件');
  expect(albumPermissionMessage()).toContain('系统设置');
  expect(cookieHeader()).toEqual({ Cookie: '' });
  receiveCookies([], { 'Set-Cookie': 'open_ai_canvas_session=app-session; Path=/; HttpOnly' });
  expect(cookieHeader()).toEqual({ Cookie: 'open_ai_canvas_session=app-session' });
  expect(removeAllCookie).toHaveBeenCalled();
  clearCookie();
  expect(cookieHeader()).toEqual({ Cookie: '' });
  receiveCookies(['open_ai_canvas_session=expired; Max-Age=-1']);
  expect(cookieHeader()).toEqual({ Cookie: '' });
});

it('keeps WeChat behavior without a native runtime', () => {
  vi.stubGlobal('plus', undefined);
  expect(clientSource()).toBe('uniapp-wechat');
  expect(audioPickerHint()).toContain('微信');
  expect(cookieHeader()).toEqual({});
});

it.each(['uniapp-wechat', 'uniapp-app'])(
  'recognizes %s tasks for library synchronization',
  (source) => {
    expect(isUniAppTask({ inputJson: JSON.stringify({ metadata: { source } }) } as Task)).toBe(
      true,
    );
  },
);
it('does not claim Web or malformed tasks', () => {
  expect(isUniAppTask({ inputJson: '{' } as Task)).toBe(false);
  expect(isUniAppTask({ inputJson: '{"metadata":{"source":"web"}}' } as Task)).toBe(false);
});
