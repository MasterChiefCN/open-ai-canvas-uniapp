<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import type { Task } from '../types/backend';
import { parseResult } from '../adapters/open-ai-canvas/task-result';
import { mediaUrl } from '../services/media';
const props = defineProps<{ task: Task }>();
const media = computed(() => parseResult(props.task).media.find((item) => item.kind === 'image'));
const url = ref('');
let revision = 0;
watch(
  media,
  async (value) => {
    const captured = ++revision;
    url.value = '';
    if (!value) return;
    try {
      const result = await mediaUrl(value);
      if (captured === revision) url.value = result;
    } catch {
      /* 缩略图失败仍保留任务详情入口 */
    }
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  revision++;
  url.value = '';
});
</script>
<template>
  <image v-if="url" class="thumbnail" :src="url" mode="aspectFill" lazy-load @error="url = ''" />
</template>
<style scoped>
.thumbnail {
  width: 100%;
  height: 240rpx;
  border-radius: 14rpx;
  margin: 16rpx 0;
}
</style>
