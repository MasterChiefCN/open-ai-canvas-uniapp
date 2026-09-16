<script setup lang="ts">
import { computed, ref } from 'vue';
import { onPullDownRefresh } from '@dcloudio/uni-app';
import { useTasks } from '../../stores/tasks';
import { useAuth } from '../../stores/auth';
import { usePage } from '../../composables/usePage';
import { watchTasks, unwatchTasks } from '../../services/task-polling';
import TaskCard from '../../components/TaskCard.vue';
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
  },
  () => {
    visible = false;
    unwatchTasks('list');
  },
);
onPullDownRefresh(refresh);
</script>
<template>
  <view class="page">
    <view class="eyebrow">YOUR CREATIONS</view>
    <view class="title">每个想法，都有进展。</view>
    <view v-if="!auth.enabled('taskCenterEnabled')" class="notice">当前实例未开放任务中心。</view>
    <template v-else>
      <view class="muted">最近 100 条任务及当前活动任务 · 搜索和统计仅针对已加载数据</view>
      <view v-if="error" class="error">
        {{ error }}
        <text class="link" @tap="refresh">重试</text>
      </view>
      <view class="field">
        <input v-model="search" class="input" placeholder="搜索已加载任务的描述或模型" />
      </view>
      <view class="chips">
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
      <view class="chips">
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
      <view class="muted small">{{ filtered.length }} 条匹配任务</view>
      <TaskCard v-for="task in filtered.slice(0, visibleCount)" :key="task.id" :task="task" />
      <view v-if="!filtered.length" class="empty">
        {{ loading ? '正在加载任务…' : '暂无匹配任务' }}
      </view>
      <button v-if="visibleCount < filtered.length" class="secondary" @tap="visibleCount += 20">
        展开已加载任务
      </button>
      <view class="footer-note">当前接口不提供更早历史的分页查询</view>
    </template>
  </view>
</template>
