<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { useAuth } from '../../stores/auth';
import { useWallet } from '../../stores/wallet';
import { walletApi } from '../../api/wallet';
import { usePage } from '../../composables/usePage';
import { formatCredits } from '../../core/credits';
const auth = useAuth();
const wallet = useWallet();
const code = ref('');
const redeeming = ref(false);
const notice = ref('');
const filters = [
  { key: 'all', label: '全部' },
  { key: 'income', label: '收入与调整' },
  { key: 'consume', label: '模型消费' },
  { key: 'refund', label: '退款' },
];
const labels: Record<string, string> = {
  redeem: '兑换入账',
  payment_topup: '充值入账',
  admin_grant: '管理员赠送',
  consume: '模型消费',
  refund: '退款',
  admin_adjustment: '管理员调整',
  signup_bonus: '注册奖励',
  checkin_bonus: '签到奖励',
};
const { error, refresh } = usePage(async () => {
  if (auth.enabled('creditsEnabled')) await wallet.load();
});
onPullDownRefresh(refresh);
async function more() {
  if (wallet.page * wallet.pageSize >= wallet.total || wallet.loading) return;
  try {
    await wallet.load(false);
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '加载失败';
  }
}
onReachBottom(more);
async function filter(key: string) {
  wallet.type = key;
  await refresh();
}
async function redeem() {
  if (redeeming.value || !code.value.trim()) return;
  redeeming.value = true;
  error.value = '';
  notice.value = '';
  try {
    await walletApi.redeem(code.value.trim());
    code.value = '';
    notice.value = '兑换成功，已刷新当前分类的余额与流水。';
    await wallet.load();
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '兑换失败';
    try {
      await wallet.load();
    } catch {
      /* 保留兑换错误 */
    }
  } finally {
    redeeming.value = false;
  }
}
</script>
<template>
  <view class="page">
    <view class="eyebrow">YOUR BALANCE</view>
    <view class="title">为下一次灵感蓄力。</view>
    <view v-if="!auth.enabled('creditsEnabled')" class="notice">当前实例未开放积分功能。</view>
    <template v-else>
      <view v-if="error" class="error">
        {{ error }}
        <text class="link" @tap="refresh">刷新核对</text>
      </view>
      <view v-if="notice" class="notice">{{ notice }}</view>
      <view class="card">
        <text class="label">可用积分</text>
        <view class="amount">
          {{ wallet.account ? formatCredits(wallet.account.availableMicrocredits) : '—' }}
        </view>
        <view class="muted">
          预占
          {{ wallet.account ? formatCredits(wallet.account.reservedMicrocredits) : '—' }}
          积分
        </view>
        <view class="separator" />
        <text class="muted small">
          预占积分用于正在执行的任务，最终扣费或退款以服务端结算为准。
        </text>
      </view>
      <view class="card">
        <view class="section-title">兑换积分</view>
        <view class="field">
          <input v-model="code" class="input" placeholder="输入兑换码" :maxlength="128" />
        </view>
        <button
          class="primary"
          :disabled="redeeming || !code.trim()"
          :loading="redeeming"
          @tap="redeem"
        >
          {{ redeeming ? '正在兑换…' : '确认兑换' }}
        </button>
      </view>
      <view class="section-title">积分流水</view>
      <view class="chips">
        <text
          v-for="item in filters"
          :key="item.key"
          class="chip"
          :class="{ active: wallet.type === item.key }"
          @tap="filter(item.key)"
        >
          {{ item.label }}
        </text>
      </view>
      <view v-for="entry in wallet.entries" :key="entry.id" class="card">
        <view class="row between">
          <text>{{ labels[entry.type] || entry.type }}</text>
          <text :class="entry.amountMicrocredits >= 0 ? 'positive' : 'negative'">
            {{ entry.amountMicrocredits > 0 ? '+' : ''
            }}{{ formatCredits(entry.amountMicrocredits) }}
          </text>
        </view>
        <view class="muted small">{{ entry.note || entry.model || '账户变动' }}</view>
        <view class="muted small">
          {{ entry.createdAt.replace('T', ' ').slice(0, 19) }} · 余额
          {{ formatCredits(entry.availableAfterMicrocredits) }}
        </view>
      </view>
      <view v-if="!wallet.entries.length" class="empty">
        {{ wallet.loading ? '正在读取流水…' : '当前分类暂无流水' }}
      </view>
      <button
        v-if="wallet.page * wallet.pageSize < wallet.total"
        class="secondary"
        :disabled="wallet.loading"
        @tap="more"
      >
        {{ wallet.loading ? '加载中…' : '加载更多流水' }}
      </button>
      <view v-else class="footer-note">已显示当前分类的全部已加载结果</view>
    </template>
  </view>
</template>
