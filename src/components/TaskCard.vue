<script setup lang="ts">
import type { Task } from '../types/backend';
import { statusLabel } from '../adapters/open-ai-canvas/task-result';
import TaskThumbnail from './TaskThumbnail.vue';
defineProps<{ task: Task }>();
const labels: Record<string, string> = {
  canvas_text: '文本',
  canvas_image: '图片',
  canvas_video: '视频',
};
function open(id: string) {
  uni.navigateTo({ url: `/pages/tasks/detail?id=${encodeURIComponent(id)}` });
}
</script>
<template>
  <view class="card" @tap="open(task.id)">
    <view class="row between">
      <text class="tag">{{ labels[task.type] || task.type }}</text>
      <text class="muted">{{ statusLabel[task.status] || task.status }}</text>
    </view>
    <TaskThumbnail :task="task" />
    <view class="task-prompt">{{ task.prompt || '无提示词' }}</view>
    <view class="muted small">{{ task.model || '未标注模型' }}</view>
    <progress
      v-if="task.status === 'running'"
      :percent="Math.min(100, Math.max(0, task.progress || 0))"
      activeColor="#a8c5ff"
      backgroundColor="#303746"
      :stroke-width="3"
    />
    <view class="row between small muted">
      <text>{{ task.createdAt.replace('T', ' ').slice(0, 16) }}</text>
      <text>查看详情 →</text>
    </view>
  </view>
</template>
<style scoped>
.task-prompt {
  margin: 20rpx 0;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
progress {
  margin: 20rpx 0;
}
</style>
