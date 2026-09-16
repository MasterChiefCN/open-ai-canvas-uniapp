<script setup lang="ts">
import { computed } from 'vue';
import type { Task } from '../types/backend';
import { assetSyncStates, syncTaskAssets } from '../services/asset-sync';
const props = defineProps<{ task: Task; detail?: boolean }>();
const state = computed(() => assetSyncStates[props.task.id]);
</script>
<template>
  <view
    v-if="state && !['checking', 'skipped'].includes(state.status)"
    class="asset-sync"
    :class="state.status"
    @tap.stop
  >
    <text v-if="state.status === 'synced'">已同步素材库</text>
    <text v-else-if="state.status === 'syncing'">正在同步素材库…</text>
    <template v-else>
      <text>生成已完成，素材同步失败</text>
      <view v-if="detail" class="sync-error">{{ state.message }}</view>
      <text class="retry-sync" @tap.stop="syncTaskAssets(task, false, true)">重试同步</text>
    </template>
  </view>
</template>
<style scoped>
.asset-sync {
  color: #96a9ca;
  font-size: 20rpx;
  margin-top: 12rpx;
  line-height: 1.5;
}
.synced {
  color: #65cbb3;
}
.error {
  color: #edb58a;
  background: transparent;
  padding: 0;
}
.retry-sync {
  color: #b6a9ff;
  margin-left: 12rpx;
  text-decoration: underline;
}
.sync-error {
  margin: 10rpx 0;
  word-break: break-word;
}
</style>
