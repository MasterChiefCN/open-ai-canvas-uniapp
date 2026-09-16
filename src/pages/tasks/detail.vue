<script setup lang="ts">
import { computed, ref } from 'vue';
import { uni } from '../../core/platform';
import { onLoad, onPullDownRefresh } from '@dcloudio/uni-app';
import { taskApi } from '../../api/tasks';
import { useTasks } from '../../stores/tasks';
import { useAuth } from '../../stores/auth';
import { useWallet } from '../../stores/wallet';
import { usePage } from '../../composables/usePage';
import { parseResult, statusLabel, canRetry } from '../../adapters/open-ai-canvas/task-result';
import { watchTasks, unwatchTasks } from '../../services/task-polling';
import { storage } from '../../core/storage';
import type { TaskLog, Mode } from '../../types/backend';
import MediaPreview from '../../components/MediaPreview.vue';
import TaskParameters from '../../components/TaskParameters.vue';
import AssetSyncStatus from '../../components/AssetSyncStatus.vue';
const id = ref('');
const logs = ref<TaskLog[]>([]);
const busy = ref(false);
const notice = ref('');
let visible = false;
const tasks = useTasks();
const task = computed(() => tasks.items[id.value]);
const result = computed(() => (task.value ? parseResult(task.value) : { text: '', media: [] }));
onLoad((query) => {
  id.value = query?.id || '';
});
const { error, loading, refresh } = usePage(
  async () => {
    visible = true;
    if (!id.value) throw new Error('缺少任务 ID');
    const value = await taskApi.get(id.value);
    tasks.put(value, true);
    if (visible) watchTasks('detail', [id.value]);
    logs.value = await taskApi.logs(id.value);
  },
  () => {
    visible = false;
    unwatchTasks('detail');
  },
);
onPullDownRefresh(refresh);
async function action(kind: 'cancel' | 'retry') {
  if (busy.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    const value = await taskApi[kind](id.value);
    tasks.put(value);
    if (kind === 'retry') {
      tasks.remember(value);
      id.value = value.id;
      if (visible) watchTasks('detail', [value.id]);
      notice.value = '已提交重试任务';
    } else notice.value = '取消请求已处理；上游确认状态与积分退款请以任务和账务记录为准。';
    await useWallet().balance();
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '操作失败';
  } finally {
    busy.value = false;
  }
}
function reuse() {
  const user = useAuth().user;
  if (!task.value || !user) return;
  storage.set(storage.userKey(user.id, 'draft'), {
    prompt: task.value.prompt,
    mode: task.value.type.replace('canvas_', '') as Mode,
  });
  uni.switchTab({ url: '/pages/create/index' });
}
</script>
<template>
  <view class="page">
    <view v-if="error" class="error">
      {{ error }}
      <text class="link" @tap="refresh">刷新</text>
    </view>
    <view v-if="notice" class="notice">{{ notice }}</view>
    <view v-if="loading && !task" class="empty">正在读取任务…</view>
    <template v-if="task">
      <view class="eyebrow">TASK DETAILS</view>
      <view class="title">{{ statusLabel[task.status] }}</view>
      <view class="muted">{{ task.model || task.type }}</view>
      <AssetSyncStatus :task="task" detail />
      <view class="card">
        <view class="label">完整描述</view>
        <view class="pre">{{ task.prompt }}</view>
        <view class="separator" />
        <view class="muted small">创建于 {{ task.createdAt.replace('T', ' ').slice(0, 19) }}</view>
        <view class="muted small">任务 ID：{{ task.id }}</view>
        <view class="muted">阶段：{{ task.stage || '等待更新' }} · {{ task.progress || 0 }}%</view>
        <progress
          :percent="Math.min(100, Math.max(0, task.progress || 0))"
          activeColor="#a8c5ff"
          backgroundColor="#303746"
        />
        <view v-if="task.error" class="error">{{ task.error }}</view>
        <view v-if="task.providerCancelStatus" class="notice">
          上游取消状态：{{ task.providerCancelStatus }}
        </view>
        <view v-if="task.billing" class="muted">账务状态：{{ task.billing.status }}</view>
      </view>
      <TaskParameters :task="task" />
      <view v-if="result.error" class="notice">{{ result.error }}</view>
      <view v-if="result.text" class="card">
        <view class="row between">
          <text class="section-title">生成结果</text>
          <text class="link" @tap="uni.setClipboardData({ data: result.text })">复制全文</text>
        </view>
        <view class="pre">{{ result.text }}</view>
      </view>
      <MediaPreview
        v-for="(media, index) in result.media"
        :key="task.id + ':' + index"
        :media="media"
      />
      <view class="chips">
        <button
          v-if="tasks.activeTask(task)"
          class="secondary"
          :disabled="busy"
          @tap="action('cancel')"
        >
          请求取消
        </button>
        <button v-if="canRetry(task)" class="secondary" :disabled="busy" @tap="action('retry')">
          重试任务
        </button>
        <button
          v-if="['canvas_text', 'canvas_image', 'canvas_video'].includes(task.type)"
          class="secondary"
          @tap="reuse"
        >
          修改描述再生成
        </button>
      </view>
      <view class="card">
        <view class="section-title">任务日志</view>
        <view v-if="!logs.length" class="muted">暂无日志，下拉刷新获取最新状态。</view>
        <view v-for="(log, index) in logs" :key="log.id || index" class="log">
          <text class="tag">
            {{ log.level }} · {{ log.createdAt?.replace('T', ' ').slice(0, 19) }}
          </text>
          <view class="pre small">{{ log.stage || log.message || '状态更新' }}</view>
        </view>
      </view>
    </template>
  </view>
</template>
<style scoped>
.pre {
  margin-top: 20rpx;
}
.log {
  margin-top: 24rpx;
  border-top: 1rpx solid #313746;
  padding-top: 16rpx;
}
progress {
  margin-top: 16rpx;
}
</style>
