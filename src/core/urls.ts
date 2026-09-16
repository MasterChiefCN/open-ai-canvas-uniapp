import { backendConfig } from '../config/backend';
export function configurationError(base = backendConfig.apiBaseUrl): string {
  if (
    !/^https:\/\/[^/?#]+\/[^?#]+$/.test(base) ||
    base.endsWith('/') ||
    /\.example(?:\/|$)/.test(base)
  )
    return '请配置后端地址：src/config/backend.ts';
  return '';
}
export function apiUrl(path: string, base = backendConfig.apiBaseUrl): string {
  if (!path.startsWith('/') || path.startsWith('//') || /[\\#]|(?:^|\/)\.\.(?:\/|$)/.test(path))
    throw new Error('无效 API 路径');
  return base + path;
}
// 不依赖小程序中并不完整的浏览器 URL 实现。
export function resourceUrl(path: string, base = backendConfig.apiBaseUrl): string {
  if (/^https:\/\//i.test(path)) return path;
  if (!path || /^(?:[a-z]+:|\/\/)/i.test(path) || path.includes('\\'))
    throw new Error('不支持的媒体地址');
  const origin = base.match(/^https:\/\/[^/]+/)?.[0];
  if (!origin) throw new Error('后端地址无效');
  return path.startsWith('/') ? origin + path : base + '/' + path;
}
