import { request } from '../core/http';
import type { Wallet } from '../types/backend';
export const walletApi = {
  get: (page = 1, type = 'all') => request<Wallet>('/wallet', 'GET', { page, pageSize: 20, type }),
  redeem: (code: string) => request('/wallet/redeem', 'POST', { code }),
};
