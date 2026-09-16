import { request, upload } from '../core/http';
import type { Resource } from '../types/backend';
export const resourceApi = {
  upload: (path: string) => upload<{ resource: Resource }>(path),
  url: (id: string) => request<{ url: string }>(`/resources/${encodeURIComponent(id)}/oss-url`),
};
