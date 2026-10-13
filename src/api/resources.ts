import { ApiError, request, upload } from '../core/http';
import type {
  Resource,
  MediaKind,
  ResourceAccess,
  ResourceAccessPurpose,
  ResourceAccessVariant,
} from '../types/backend';
export const resourceApi = {
  get: (id: string) => request<{ resource: Resource }>(`/resources/${encodeURIComponent(id)}`),
  importUrl: (url: string, kind: 'image' | 'video', idempotencyKey: string) =>
    request<{ resource: Resource }>('/resources/import', 'POST', { url, kind }, false, {
      'X-Idempotency-Key': idempotencyKey,
    }),
  upload: (
    path: string,
    kind: MediaKind = 'image',
    meta: { width?: number; height?: number; durationMs?: number } = {},
  ) => upload<{ resource: Resource }>(path, kind, meta),
  async url(
    id: string,
    purpose: ResourceAccessPurpose = 'display',
    variant: ResourceAccessVariant = 'original',
  ): Promise<ResourceAccess> {
    const { items } = await request<{
      items: Array<{
        resourceId: string;
        access?: ResourceAccess;
        error?: { code: number; reason: string; msg: string };
      }>;
    }>('/resources/access', 'POST', [{ resourceId: id, purpose, variant }]);
    const item = items?.[0];
    if (item?.error) throw new ApiError(item.error.msg, 0, item.error.code, item.error.reason);
    if (item?.resourceId !== id || item.access?.resourceId !== id || !item.access.url)
      throw new Error('后端未返回有效的资源访问地址');
    return item.access;
  },
};
