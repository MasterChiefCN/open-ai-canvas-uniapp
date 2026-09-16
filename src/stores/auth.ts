import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { authApi } from '../api/auth';
import { cancelRequests, setUnauthorizedHandler } from '../core/http';
import { clearCookie, cookieHeader } from '../core/session';
import { storage } from '../core/storage';
import type { Session } from '../types/backend';
const resetHandlers = new Set<() => void>();
export function onSessionReset(handler: () => void) {
  resetHandlers.add(handler);
}
let redirecting = false;
export const useAuth = defineStore('auth', () => {
  const session = ref<Session>({ user: null });
  const user = computed(() => session.value.user);
  const enabled = (feature: 'creditsEnabled' | 'taskCenterEnabled') =>
    session.value.features?.[feature] !== false;
  function clear() {
    cancelRequests();
    const id = user.value?.id;
    if (id) storage.clearUser(id);
    clearCookie();
    session.value = { user: null };
    resetHandlers.forEach((handler) => handler());
  }
  function toLogin() {
    if (redirecting) return;
    const page = getCurrentPages().slice(-1)[0];
    if (page?.route?.startsWith('pages/auth/')) return;
    redirecting = true;
    uni.reLaunch({
      url: '/pages/auth/login',
      complete: () => {
        redirecting = false;
      },
    });
  }
  async function restore() {
    const next = await authApi.session();
    if (!next.user) {
      clear();
      return false;
    }
    if (user.value && user.value.id !== next.user.id) {
      const previousId = user.value.id;
      cancelRequests();
      storage.clearUser(previousId);
      resetHandlers.forEach((handler) => handler());
    }
    session.value = next;
    return true;
  }
  async function requireUser() {
    if (user.value && cookieHeader().Cookie) return true;
    if (cookieHeader().Cookie && (await restore())) return true;
    clear();
    toLogin();
    return false;
  }
  async function authenticate(action: () => Promise<unknown>) {
    clear();
    await action();
    if (!(await restore())) throw new Error('登录未建立有效会话，请检查小程序 Cookie 配置');
    uni.switchTab({ url: '/pages/create/index' });
  }
  async function logout() {
    let serverConfirmed = false;
    try {
      await authApi.logout();
      serverConfirmed = true;
    } finally {
      clear();
      toLogin();
    }
    return serverConfirmed;
  }
  setUnauthorizedHandler(() => {
    clear();
    toLogin();
  });
  return {
    session,
    user,
    enabled,
    clear,
    restore,
    requireUser,
    authenticate,
    logout,
  };
});
