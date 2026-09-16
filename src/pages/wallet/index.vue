<script setup lang="ts">
import { ref } from 'vue';
import { onPullDownRefresh, onReachBottom } from '@dcloudio/uni-app';
import { useAuth } from '../../stores/auth';
import { useWallet } from '../../stores/wallet';
import { walletApi } from '../../api/wallet';
import { usePage } from '../../composables/usePage';
import { formatCredits } from '../../core/credits';
import StudioHeader from '../../components/StudioHeader.vue';
import StudioHero from '../../components/StudioHero.vue';
import UiIcon from '../../components/UiIcon.vue';
const auth = useAuth();
const wallet = useWallet();
const code = ref('');
const redeeming = ref(false);
const notice = ref('');
const filters = [
  { key: 'all', label: '全部' },
  { key: 'income', label: '收入' },
  { key: 'consume', label: '消费' },
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
  <view class="page studio-page">
    <StudioHeader />
    <StudioHero title="我的积分" subtitle="为下一次灵感蓄力" wallet />
    <view v-if="!auth.enabled('creditsEnabled')" class="notice">当前实例未开放积分功能。</view>
    <template v-else>
      <view v-if="error" class="error">
        {{ error }}
        <text class="link" @tap="refresh">刷新核对</text>
      </view>
      <view v-if="notice" class="notice">{{ notice }}</view>
      <view class="card balance-card">
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
      <view class="card redeem-card">
        <view class="section-title">兑换积分</view>
        <view class="redeem-form">
          <input v-model="code" class="input" placeholder="输入兑换码" :maxlength="128" />
          <button
            class="primary"
            :disabled="redeeming || !code.trim()"
            :loading="redeeming"
            @tap="redeem"
          >
            {{ redeeming ? '正在兑换…' : '确认兑换' }}
          </button>
        </view>
      </view>
      <view class="section-heading">
        <text class="section-title">积分流水</text>
        <text class="muted small">账户收支记录</text>
      </view>
      <view class="chips filter-chips">
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
      <view v-if="wallet.entries.length" class="card ledger-card">
        <view v-for="entry in wallet.entries" :key="entry.id" class="ledger-entry">
          <view class="ledger-icon">
            <UiIcon
              :name="
                entry.type === 'refund' ? 'refund' : entry.type === 'consume' ? 'bolt' : 'gift'
              "
              :size="34"
            />
          </view>
          <view class="grow">
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
<style scoped>
.balance-card {
  position: relative;
  overflow: hidden;
  margin-top: 0;
  padding: 30rpx;
  border-color: #566eae;
  background:
    radial-gradient(ellipse at 95% 100%, #414ba864, #14223b00 60%),
    linear-gradient(130deg, #1b3565, #101c35 65%, #14244a);
  box-shadow:
    inset 0 1rpx 12rpx #6b9afa25,
    0 8rpx 30rpx #05091450;
}
.balance-card .label {
  color: #dfebff;
  margin-bottom: 0;
}
.balance-card .amount {
  font-size: 78rpx;
  line-height: 1.4;
  letter-spacing: -2rpx;
}
.balance-card .separator {
  background: #3c548055;
  margin: 18rpx 0;
}
.redeem-card {
  padding: 24rpx;
}
.redeem-form {
  display: flex;
  gap: 16rpx;
  margin-top: 20rpx;
  align-items: center;
}
.redeem-form .input {
  flex: 1;
  min-width: 0;
  height: 78rpx;
  min-height: 78rpx;
  font-size: 24rpx;
}
.redeem-form .primary {
  margin: 0;
  min-height: 78rpx;
  line-height: 78rpx;
  font-size: 25rpx;
  border-radius: 18rpx;
  flex-shrink: 0;
  padding: 0 24rpx;
}
.ledger-card {
  padding: 0 24rpx;
  margin-top: 0;
}
.ledger-entry {
  display: flex;
  gap: 18rpx;
  padding: 26rpx 0;
  border-bottom: 1rpx solid #35445b;
}
.ledger-entry:last-child {
  border-bottom: 0;
}
.ledger-icon {
  flex-shrink: 0;
  width: 58rpx;
  height: 58rpx;
  border: 1rpx solid #3c4b62;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #0e192875;
}
.ledger-entry .small {
  font-size: 20rpx;
  margin-top: 5rpx;
  word-break: break-all;
}
.ledger-entry .positive,
.ledger-entry .negative {
  font-weight: 600;
  white-space: nowrap;
}
</style>
