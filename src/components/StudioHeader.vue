<script setup lang="ts">
import { computed } from 'vue';
import { uni } from '../core/platform';
import { useAuth } from '../stores/auth';
import { useWallet } from '../stores/wallet';
import { formatCredits } from '../core/credits';
import UiIcon from './UiIcon.vue';
const auth = useAuth();
const wallet = useWallet();
const initial = computed(() => (auth.user?.displayName || auth.user?.username || '创').slice(0, 1));
function accountMenu() {
  uni.showActionSheet({
    itemList: ['退出登录'],
    success: async ({ tapIndex }) => {
      if (tapIndex !== 0) return;
      try {
        await auth.logout();
      } catch {
        uni.showToast({ title: '本地已退出；服务器注销未确认', icon: 'none' });
      }
    },
  });
}
</script>
<template>
  <view class="studio-header">
    <view class="brand-orb" />
    <view class="brand-copy grow">
      <view class="brand-name">Open AI Canvas</view>
      <view class="brand-caption">创意成真 · AI 让想象发生</view>
    </view>
    <view
      v-if="auth.enabled('creditsEnabled')"
      class="balance-pill"
      @tap="uni.switchTab({ url: '/pages/wallet/index' })"
    >
      <UiIcon name="bolt" :size="26" />
      <text>
        {{ wallet.account ? formatCredits(wallet.account.availableMicrocredits) : '—' }} 积分
      </text>
    </view>
    <button class="avatar" aria-label="账号菜单" @tap="accountMenu">{{ initial }}</button>
  </view>
</template>
<style scoped>
.studio-header {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 10rpx 0 26rpx;
  position: relative;
  z-index: 1;
}
.brand-orb {
  width: 58rpx;
  height: 58rpx;
  flex-shrink: 0;
  border-radius: 42% 58% 55% 45%;
  transform: rotate(-25deg);
  background: radial-gradient(
    circle at 28% 20%,
    #eff9ff 0%,
    #94b6ff 12%,
    #8157fc 38%,
    #3c1aaa 65%,
    #71ccff 100%
  );
  box-shadow:
    inset 2rpx 2rpx 8rpx #cfbdff,
    0 0 24rpx #5149ac70;
}
.brand-name {
  font-size: 27rpx;
  font-weight: 650;
  white-space: nowrap;
}
.brand-caption {
  color: #8799b6;
  font-size: 19rpx;
  white-space: nowrap;
  margin-top: 3rpx;
}
.balance-pill {
  display: flex;
  align-items: center;
  gap: 5rpx;
  font-size: 21rpx;
  padding: 10rpx 12rpx;
  border: 1rpx solid #52637f;
  border-radius: 40rpx;
  background: linear-gradient(130deg, #182432, #182035);
  white-space: nowrap;
}
.avatar {
  width: 52rpx;
  height: 52rpx;
  min-width: 52rpx;
  margin: 0;
  padding: 0;
  line-height: 52rpx;
  border-radius: 50%;
  font-size: 24rpx;
  color: #f4edff;
  background: linear-gradient(135deg, #615eaf, #292442);
  border: 1rpx solid #ad9bcd;
}
@media (max-width: 350px) {
  .studio-header {
    gap: 10rpx;
  }
  .brand-name {
    font-size: 24rpx;
  }
  .brand-caption {
    font-size: 17rpx;
  }
  .balance-pill {
    font-size: 19rpx;
    padding: 8rpx;
  }
}
</style>
