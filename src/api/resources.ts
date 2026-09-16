import { request, upload } from '../core/http';
import type { Resource } from '../types/backend';
export const resourceApi = {
  get: (id: string) => request<{ resource: Resource }>(`/resources/${encodeURIComponent(id)}`),
  importUrl: (url: string, kind: 'image' | 'video', idempotencyKey: string) =>
    request<{ resource: Resource }>('/resources/import', 'POST', { url, kind }, false, {
      'X-Idempotency-Key': idempotencyKey,
    }),
  upload: (path: string) => upload<{ resource: Resource }>(path),
  url: (id: string) => request<{ url: string }>(`/resources/${encodeURIComponent(id)}/oss-url`),
};
