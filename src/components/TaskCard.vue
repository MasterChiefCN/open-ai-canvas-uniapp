<script setup lang="ts">
import type { Task } from '../types/backend';
import { statusLabel } from '../adapters/open-ai-canvas/task-result';
import TaskThumbnail from './TaskThumbnail.vue';
import AssetSyncStatus from './AssetSyncStatus.vue';
defineProps<{ task: Task; compact?: boolean }>();
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
  <view class="task-card" :class="{ compact }" @tap="open(task.id)">
    <view class="task-preview">
      <TaskThumbnail :task="task" />
      <text class="type-badge">{{ labels[task.type] || '其他' }}</text>
    </view>
    <view class="task-content">
      <view class="task-prompt">{{ task.prompt || '无提示词' }}</view>
      <view class="task-meta">
        <text class="task-model">{{ task.model || '未标注模型' }}</text>
        <text class="status-badge" :class="task.status">
          {{ statusLabel[task.status] || task.status }}
        </text>
      </view>
      <view v-if="task.status === 'running'" class="task-progress">
        <progress
          :percent="Math.min(100, Math.max(0, task.progress || 0))"
          activeColor="#8b73ff"
          backgroundColor="#303e56"
          :stroke-width="3"
        />
        <text>{{ Math.min(100, Math.max(0, task.progress || 0)) }}%</text>
      </view>
      <AssetSyncStatus :task="task" />
      <view class="task-date">
        <text>{{ task.createdAt.replace('T', ' ').slice(0, 16) }}</text>
        <text v-if="!compact" class="detail-arrow">›</text>
      </view>
    </view>
  </view>
</template>
<style scoped>
.task-card {
  display: flex;
  gap: 22rpx;
  padding: 14rpx;
  border: 1rpx solid #33435a;
  border-radius: 24rpx;
  background: linear-gradient(125deg, #1e2b3c, #131e2c);
  margin-bottom: 16rpx;
  overflow: hidden;
}
.task-preview {
  width: 190rpx;
  height: 190rpx;
  flex-shrink: 0;
  position: relative;
}
.type-badge {
  position: absolute;
  top: 10rpx;
  left: 10rpx;
  background: #07101acc;
  border: 1rpx solid #64758c70;
  border-radius: 9rpx;
  padding: 2rpx 10rpx;
  font-size: 19rpx;
  color: #e6edf9;
}
.task-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 4rpx 8rpx 4rpx 0;
}
.task-prompt {
  margin-bottom: 12rpx;
  font-size: 27rpx;
  font-weight: 550;
  line-height: 1.45;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.task-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8rpx;
}
.task-model {
  color: #93a9ca;
  font-size: 20rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 100%;
}
.status-badge {
  font-size: 19rpx;
  padding: 2rpx 12rpx;
  border-radius: 24rpx;
  border: 1rpx solid #526078;
  color: #a6b7d2;
  white-space: nowrap;
}
.running {
  color: #bbadff;
  border-color: #7164c4;
  background: #44327d40;
}
.succeeded {
  color: #55e2be;
  border-color: #277d6e;
  background: #145e4535;
}
.failed {
  color: #ff939f;
  border-color: #934758;
  background: #7e29402b;
}
.task-progress {
  display: flex;
  gap: 12rpx;
  align-items: center;
  font-size: 18rpx;
  margin-top: 12rpx;
  color: #c6d3ec;
}
.task-progress progress {
  flex: 1;
}
.task-date {
  display: flex;
  justify-content: space-between;
  align-items: center;
  color: #849ab9;
  font-size: 19rpx;
  margin-top: 14rpx;
}
.detail-arrow {
  font-size: 30rpx;
  line-height: 1;
}
.compact {
  display: block;
  padding: 0;
  margin: 0;
}
.compact .task-preview {
  width: 100%;
  height: 220rpx;
}
.compact .task-content {
  padding: 16rpx;
}
.compact .task-prompt {
  font-size: 24rpx;
  -webkit-line-clamp: 1;
}
.compact .task-model {
  display: none;
}
.compact .task-date {
  font-size: 18rpx;
}
@media (max-width: 350px) {
  .task-preview {
    width: 156rpx;
    height: 190rpx;
  }
  .task-card {
    gap: 14rpx;
  }
}
</style>
