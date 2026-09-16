import { storage } from './storage';
import { clearNativeCookies, isNativeApp } from './runtime';
export const cookieName = 'open_ai_canvas_session';
export type SessionCookie = { value: string; expiresAt?: number };
export function parseSessionCookies(
  headers: string[],
  now = Date.now(),
): SessionCookie | null | undefined {
  let result: SessionCookie | null | undefined;
  for (const line of headers)
    for (const raw of line.split(/,(?=\s*[^;,=\s]+=[^;]*)/)) {
      const parts = raw
        .trim()
        .split(';')
        .map((x) => x.trim());
      const separator = parts[0].indexOf('=');
      if (parts[0].slice(0, separator) !== cookieName) continue;
      const value = parts[0].slice(separator + 1);
      let expiresAt: number | undefined;
      let maxAge: number | undefined;
      for (const part of parts.slice(1)) {
        const index = part.indexOf('=');
        const key = part.slice(0, index).toLowerCase();
        const val = part.slice(index + 1);
        if (key === 'max-age' && /^-?\d+$/.test(val)) maxAge = Number(val);
        if (key === 'expires' && Number.isFinite(Date.parse(val))) expiresAt = Date.parse(val);
      }
      if (maxAge !== undefined) expiresAt = now + maxAge * 1000;
      result =
        !value || /[\r\n]/.test(value) || (expiresAt !== undefined && expiresAt <= now)
          ? null
          : { value, expiresAt };
    }
  return result;
}
export function receiveCookies(cookies: string[] = [], headers: Record<string, unknown> = {}) {
  const lines = [...cookies];
  for (const [key, value] of Object.entries(headers))
    if (key.toLowerCase() === 'set-cookie')
      lines.push(...(Array.isArray(value) ? value.map(String) : [String(value)]));
  const parsed = parseSessionCookies(lines);
  if (parsed === null) clearCookie();
  else if (parsed) storage.set('session', parsed);
  // App 会自动保存响应 Cookie；业务会话已显式保存，清除原生副本，
  // 避免媒体下载/预览或下一次切换账号绕过受控请求头。
  if (parsed !== null) clearNativeCookies();
}
export function cookieHeader(): Record<string, string> {
  const cookie = storage.get<SessionCookie>('session');
  if (!cookie) return isNativeApp() ? { Cookie: '' } : {};
  if (cookie.expiresAt !== undefined && cookie.expiresAt <= Date.now()) {
    clearCookie();
    return isNativeApp() ? { Cookie: '' } : {};
  }
  return { Cookie: `${cookieName}=${cookie.value}` };
}
export function clearCookie() {
  storage.remove('session');
  clearNativeCookies();
}
