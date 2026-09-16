<script setup lang="ts">
import { computed, ref } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { useTasks } from '../../stores/tasks';
import { useAuth } from '../../stores/auth';
import { usePage } from '../../composables/usePage';
import { watchTasks, unwatchTasks } from '../../services/task-polling';
import TaskCard from '../../components/TaskCard.vue';
import StudioHeader from '../../components/StudioHeader.vue';
import StudioHero from '../../components/StudioHero.vue';
import UiIcon from '../../components/UiIcon.vue';
import { useWallet } from '../../stores/wallet';
const tasks = useTasks();
const auth = useAuth();
const search = ref('');
const status = ref('all');
const type = ref('all');
const visibleCount = ref(20);
let visible = false;
const statusFilters = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'succeeded', label: '已完成' },
  { key: 'failed', label: '失败 / 取消' },
];
const typeFilters = [
  { key: 'all', label: '全部类型' },
  { key: 'canvas_video', label: '视频' },
  { key: 'canvas_image', label: '图片' },
  { key: 'canvas_text', label: '文本' },
];
const filtered = computed(() =>
  tasks.recentIds
    .map((id) => tasks.items[id])
    .filter(
      (task) =>
        task &&
        (type.value === 'all' || type.value === task.type) &&
        (status.value === 'all' ||
          (status.value === 'active'
            ? tasks.activeTask(task)
            : status.value === 'failed'
              ? ['failed', 'cancelled'].includes(task.status)
              : task.status === status.value)) &&
        `${task.prompt} ${task.model || ''}`.toLowerCase().includes(search.value.toLowerCase()),
    )
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
);
const { error, loading, refresh } = usePage(
  async () => {
    visible = true;
    if (!auth.enabled('taskCenterEnabled')) return;
    await tasks.refresh();
    if (visible) watchTasks('list', tasks.recentIds);
    await useWallet().balance();
  },
  () => {
    visible = false;
    unwatchTasks('list');
  },
);
onPullDownRefresh(refresh);
</script>
<template>
  <view class="page studio-page">
    <StudioHeader />
    <StudioHero title="我的任务" subtitle="每个想法，都有进展" />
    <view v-if="!auth.enabled('taskCenterEnabled')" class="notice">当前实例未开放任务中心。</view>
    <template v-else>
      <view v-if="error" class="error">
        {{ error }}
        <text class="link" @tap="refresh">重试</text>
      </view>
      <view class="search-box">
        <UiIcon name="search" :size="32" />
        <input v-model="search" class="search-input" placeholder="搜索任务描述或模型" />
      </view>
      <view class="chips filter-chips">
        <text
          v-for="filter in statusFilters"
          :key="filter.key"
          class="chip"
          :class="{ active: status === filter.key }"
          @tap="
            status = filter.key;
            visibleCount = 20;
          "
        >
          {{ filter.label }}
        </text>
      </view>
      <view class="chips filter-chips type-filters">
        <text
          v-for="filter in typeFilters"
          :key="filter.key"
          class="chip"
          :class="{ active: type === filter.key }"
          @tap="
            type = filter.key;
            visibleCount = 20;
          "
        >
          {{ filter.label }}
        </text>
      </view>
      <view class="result-count">{{ filtered.length }} 条匹配任务 · 当前已加载记录</view>
      <TaskCard v-for="task in filtered.slice(0, visibleCount)" :key="task.id" :task="task" />
      <view v-if="!filtered.length" class="empty">
        {{ loading ? '正在加载任务…' : '暂无匹配任务' }}
      </view>
      <button v-if="visibleCount < filtered.length" class="secondary" @tap="visibleCount += 20">
        展开已加载任务
      </button>
      <view class="footer-note">
        <view>最近 100 条任务及当前活动任务</view>
        <view>搜索与筛选仅针对已加载记录</view>
      </view>
    </template>
  </view>
</template>
<style scoped>
.search-box {
  display: flex;
  align-items: center;
  gap: 16rpx;
  border: 1rpx solid #40516a;
  border-radius: 22rpx;
  padding: 18rpx 22rpx;
  background: linear-gradient(120deg, #1d2a3b, #111c2a);
}
.search-input {
  background: transparent;
  border: 0;
  flex: 1;
  min-width: 0;
  color: #edf3ff;
  height: 44rpx;
  font-size: 26rpx;
}
.result-count {
  color: #8095b2;
  font-size: 21rpx;
  margin-bottom: 20rpx;
}
.type-filters {
  margin-top: -6rpx;
}
.type-filters .chip {
  border-radius: 16rpx;
}
</style>
