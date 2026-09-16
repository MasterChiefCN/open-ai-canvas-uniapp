<script setup lang="ts">
import { computed, ref, watch, onBeforeUnmount } from 'vue';
import type { Task } from '../types/backend';
import { parseResult } from '../adapters/open-ai-canvas/task-result';
import { mediaUrl } from '../services/media';
import UiIcon from './UiIcon.vue';
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
  <view v-else class="thumbnail placeholder" :class="task.type">
    <view class="placeholder-orbit" />
    <UiIcon
      :name="
        task.type === 'canvas_video'
          ? 'video'
          : task.type === 'canvas_text'
            ? 'text'
            : task.type === 'canvas_image'
              ? 'image'
              : 'tasks'
      "
      :size="52"
    />
    <text>
      {{
        task.type === 'canvas_text'
          ? '文字创作'
          : task.status === 'running'
            ? '创作进行中'
            : task.status === 'queued'
              ? '等待生成'
              : '暂无预览'
      }}
    </text>
  </view>
</template>
<style scoped>
.thumbnail {
  width: 100%;
  height: 100%;
  display: block;
  border-radius: 16rpx;
}
.placeholder {
  position: relative;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12rpx;
  background: radial-gradient(ellipse at 25% 15%, #37528c, #172740 50%, #0e1829);
  color: #afc2e6;
  font-size: 19rpx;
}
.canvas_text {
  background: radial-gradient(ellipse at 25% 15%, #584680, #24213e 50%, #131829);
}
.placeholder-orbit {
  position: absolute;
  width: 210rpx;
  height: 95rpx;
  border: 1rpx solid #758ac92b;
  border-radius: 50%;
  transform: rotate(-35deg);
}
</style>
