import { request } from '../core/http';
import type { Catalog } from '../types/backend';
export const modelApi = {
  catalog: () => request<Catalog>('/model-catalog'),
  available: (intent: object) => request<Catalog>('/model-catalog/available', 'POST', intent),
};
