import { ApiError, request } from '../core/http';
export type LibraryAsset = {
  id: string;
  kind: 'text' | 'image' | 'video' | 'audio';
  title: string;
  coverUrl: string;
  tags: string[];
  status: 'confirmed';
  source: string;
  createdAt: string;
  updatedAt: string;
  metadata: { source: string; [key: string]: string | number };
  data: Record<string, string | number>;
};
export const assetApi = {
  async get(id: string): Promise<LibraryAsset | undefined> {
    try {
      return (await request<{ asset: LibraryAsset }>(`/assets/${encodeURIComponent(id)}`)).asset;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return undefined;
      throw error;
    }
  },
  put: (asset: LibraryAsset) =>
    request<{ asset: { id: string } }>(`/assets/${encodeURIComponent(asset.id)}`, 'PUT', { asset }),
};
