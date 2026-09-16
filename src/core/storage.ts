import { backendConfig } from '../config/backend';
const prefix = `oac:${encodeURIComponent(backendConfig.apiBaseUrl)}:`;
export const storage = {
  get<T>(key: string): T | undefined {
    return uni.getStorageSync(prefix + key) || undefined;
  },
  set(key: string, value: unknown) {
    uni.setStorageSync(prefix + key, value);
  },
  remove(key: string) {
    uni.removeStorageSync(prefix + key);
  },
  userKey(userId: string, key: string) {
    return `user:${encodeURIComponent(userId)}:${key}`;
  },
  clearUser(userId: string) {
    const start = prefix + this.userKey(userId, '');
    for (const key of uni.getStorageInfoSync().keys)
      if (key.startsWith(start)) uni.removeStorageSync(key);
  },
};
