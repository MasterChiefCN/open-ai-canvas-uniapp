import { defineStore } from 'pinia';
import { ref } from 'vue';
import { walletApi } from '../api/wallet';
import { onSessionReset, useAuth } from './auth';
import type { Account, Ledger } from '../types/backend';
export const useWallet = defineStore('wallet', () => {
  const account = ref<Account>();
  const entries = ref<Ledger[]>([]);
  const total = ref(0);
  const page = ref(0);
  const pageSize = ref(20);
  const type = ref('all');
  const loading = ref(false);
  let version = 0;
  onSessionReset(() => {
    version++;
    account.value = undefined;
    entries.value = [];
    total.value = 0;
    page.value = 0;
    loading.value = false;
  });
  async function balance() {
    if (!useAuth().user || !useAuth().enabled('creditsEnabled')) return;
    const result = await walletApi.get();
    account.value = result.account;
  }
  async function load(reset = true) {
    if (!useAuth().enabled('creditsEnabled')) return;
    if (loading.value && !reset) return;
    const current = ++version;
    const nextPage = reset ? 1 : page.value + 1;
    loading.value = true;
    if (reset) {
      entries.value = [];
      page.value = 0;
    }
    try {
      const result = await walletApi.get(nextPage, type.value);
      if (current !== version) return;
      account.value = result.account;
      entries.value = reset ? result.entries : [...entries.value, ...result.entries];
      total.value = result.total;
      page.value = result.page;
      pageSize.value = result.pageSize;
    } finally {
      if (current === version) loading.value = false;
    }
  }
  return {
    account,
    entries,
    total,
    page,
    pageSize,
    type,
    loading,
    balance,
    load,
  };
});
