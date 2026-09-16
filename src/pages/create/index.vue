<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { uni } from '../../core/platform';
import { modelApi } from '../../api/models';
import { resourceApi } from '../../api/resources';
import { useAuth, onSessionReset } from '../../stores/auth';
import { useTasks } from '../../stores/tasks';
import { useWallet } from '../../stores/wallet';
import { usePage, notifyError } from '../../composables/usePage';
import {
  normalizeCatalog,
  parameterFields,
  defaultParameters,
  validateModel,
} from '../../adapters/open-ai-canvas/model-capabilities';
import { parseResult } from '../../adapters/open-ai-canvas/task-result';
import type { HistoryMessage } from '../../adapters/open-ai-canvas/generation';
import { generate } from '../../services/generation';
import { watchTasks, unwatchTasks } from '../../services/task-polling';
import { formatCredits } from '../../core/credits';
import { storage } from '../../core/storage';
import { assertEpoch, requestEpoch } from '../../core/http';
import type { Mode, Model, ImageReference } from '../../types/backend';
import TaskCard from '../../components/TaskCard.vue';
const auth = useAuth();
const tasks = useTasks();
const wallet = useWallet();
const mode = ref<Mode>('image');
const prompt = ref('');
const models = ref<Model[]>([]);
const selectedId = ref('');
const options = ref<Record<string, unknown>>({});
const references = ref<Array<ImageReference & { preview: string }>>([]);
const submitting = ref(false);
const uploading = ref(false);
const notice = ref('');
const showParameters = ref(false);
const history = ref<HistoryMessage[]>([]);
const lastTextTask = ref('');
let pageVisible = false;
const modes: Array<{ key: Mode; label: string }> = [
  { key: 'video', label: '视频' },
  { key: 'image', label: '图片' },
  { key: 'text', label: '文本' },
];
const available = computed(() => models.value.filter((model) => model.mode === mode.value));
const selected = computed(() => available.value.find((model) => model.id === selectedId.value));
const fields = computed(() => parameterFields(selected.value));
const maxImages = computed(() => selected.value?.spec.inputs?.image?.max || 0);
const currentTasks = computed(() => tasks.createdIds.map((id) => tasks.items[id]).filter(Boolean));
const textTask = computed(() => tasks.items[lastTextTask.value]);
const textResult = computed(() => (textTask.value ? parseResult(textTask.value).text : ''));
function draftKey() {
  // 不把临时上传路径持久化为资源引用。
  return auth.user ? storage.userKey(auth.user.id, 'draft') : '';
}
function changeMode(value: Mode) {
  if (!submitting.value && !uploading.value) mode.value = value;
}
function persistDraft() {
  if (draftKey())
    storage.set(draftKey(), {
      prompt: prompt.value,
      mode: mode.value,
      history: history.value,
      lastTextTask: lastTextTask.value,
    });
}
watch([prompt, mode, history, lastTextTask], persistDraft, { deep: true });
watch(mode, () => {
  selectedId.value = available.value[0]?.id || '';
  references.value = [];
});
watch(selectedId, () => {
  options.value = defaultParameters(selected.value);
  references.value = [];
});
watch(
  () => tasks.createdIds.join(','),
  () => {
    if (pageVisible) watchTasks('create', tasks.createdIds);
  },
);
onSessionReset(() => {
  prompt.value = '';
  models.value = [];
  references.value = [];
  history.value = [];
  lastTextTask.value = '';
  notice.value = '';
  pageVisible = false;
});
const { error, loading, refresh } = usePage(
  async () => {
    pageVisible = true;
    const draft = storage.get<{
      prompt: string;
      mode: Mode;
      history?: HistoryMessage[];
      lastTextTask?: string;
    }>(draftKey());
    if (draft) {
      mode.value = draft.mode;
      prompt.value = draft.prompt;
      history.value = draft.history || [];
      lastTextTask.value = draft.lastTextTask || '';
    }
    tasks.restore();
    const catalog = await modelApi.catalog();
    models.value = normalizeCatalog(catalog);
    if (!available.value.some((model) => model.id === selectedId.value))
      selectedId.value = available.value[0]?.id || '';
    if (!models.value.length)
      notice.value = '当前没有具备完整能力配置的可用模型，请联系管理员检查模型目录。';
    await tasks.refresh();
    if (pageVisible) watchTasks('create', tasks.createdIds);
    await wallet.balance();
  },
  () => {
    pageVisible = false;
    unwatchTasks('create');
  },
);
function selectModel(event: { detail: { value: string | number } }) {
  selectedId.value = available.value[Number(event.detail.value)]?.id || '';
}
function selectOption(
  key: string,
  values: Array<string | number | boolean>,
  event: { detail: { value: string | number } },
) {
  options.value[key] = values[Number(event.detail.value)];
}
async function addImage() {
  if (uploading.value || !selected.value) return;
  const model = selected.value;
  const epoch = requestEpoch();
  uploading.value = true;
  try {
    const selection = await new Promise<UniApp.ChooseImageSuccessCallbackResult>(
      (resolve, reject) =>
        uni.chooseImage({
          count: Math.min(9, maxImages.value - references.value.length),
          sizeType: ['compressed'],
          success: resolve,
          fail: reject,
        }),
    );
    const paths = selection.tempFilePaths;
    const files = Array.isArray(selection.tempFiles) ? selection.tempFiles : [];
    for (let index = 0; index < paths.length; index++) {
      assertEpoch(epoch);
      const runtimeMax = (auth.session.runtimeLimits?.resourceUploadMB || 50) * 1024 * 1024;
      const limit = model.maxImageBytes ? Math.min(runtimeMax, model.maxImageBytes) : runtimeMax;
      if (files[index]?.size > limit)
        throw new Error(`参考图超出上传限制（${Math.floor(limit / 1024 / 1024)} MB）`);
      const { resource } = await resourceApi.upload(paths[index]);
      if (selectedId.value !== model.id) throw new Error('模型已切换，请重新选择参考图');
      references.value.push({
        id: resource.id,
        name: `参考图 ${references.value.length + 1}`,
        type: resource.mimeType,
        dataUrl: '',
        storageKey: `resource:${resource.id}`,
        bytes: resource.size,
        preview: paths[index],
      });
    }
  } catch (failure) {
    if (
      !(
        failure &&
        typeof failure === 'object' &&
        'errMsg' in failure &&
        String(failure.errMsg).includes('cancel')
      )
    )
      notifyError(failure);
  } finally {
    uploading.value = false;
  }
}
async function submit() {
  if (submitting.value || uploading.value || !selected.value) return;
  submitting.value = true;
  notice.value = '';
  error.value = '';
  try {
    validateModel(selected.value, prompt.value, references.value.length, options.value);
    let context = [...history.value];
    if (mode.value === 'text' && textTask.value) {
      if (tasks.activeTask(textTask.value)) throw new Error('请等待当前文本生成完成后继续提问');
      if (textTask.value.status === 'succeeded' && textResult.value)
        context = [
          ...context,
          { role: 'user', content: textTask.value.prompt },
          { role: 'assistant', content: textResult.value },
        ];
    }
    const refs = references.value.map(({ preview: _preview, ...reference }) => reference);
    const result = await generate(
      selected.value,
      prompt.value,
      refs,
      options.value,
      mode.value === 'text' ? context : [],
    );
    if (result.tasks.length) {
      if (mode.value === 'text') {
        history.value = context;
        lastTextTask.value = result.tasks[0].id;
      }
      if (pageVisible) watchTasks('create', tasks.createdIds);
      notice.value = `已提交 ${result.tasks.length} 个任务，可在任务页查看进度。`;
    }
    if (result.error)
      error.value = `已提交 ${result.tasks.length}/${result.requested} 项。${result.error}。请核对任务列表，已成功项无需重发。`;
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '生成提交失败';
  } finally {
    submitting.value = false;
  }
}
function newConversation() {
  history.value = [];
  lastTextTask.value = '';
  prompt.value = '';
}
async function logout() {
  try {
    await auth.logout();
  } catch {
    uni.showToast({ title: '本地已退出；服务器注销未确认', icon: 'none' });
  }
}
</script>
<template>
  <view class="page">
    <view class="row between">
      <text class="eyebrow">CREATIVE STUDIO</text>
      <text class="link" @tap="logout">退出登录</text>
    </view>
    <view class="title">把灵感变成作品。</view>
    <view class="row between">
      <text class="subtitle">
        {{ auth.user?.displayName || auth.user?.username || '创作者' }}，今天想创造什么？
      </text>
      <text v-if="auth.enabled('creditsEnabled')" class="tag">
        {{ wallet.account ? formatCredits(wallet.account.availableMicrocredits) : '—' }} 积分
      </text>
    </view>
    <view v-if="error" class="error">{{ error }}</view>
    <view v-if="notice" class="notice">{{ notice }}</view>
    <view class="chips">
      <text
        v-for="item in modes"
        :key="item.key"
        class="chip"
        :class="{ active: mode === item.key }"
        @tap="changeMode(item.key)"
      >
        {{ item.label }}
      </text>
    </view>
    <view class="card">
      <view class="row between">
        <text class="section-title">
          {{
            mode === 'video'
              ? '导演你的下一幕'
              : mode === 'image'
                ? '描绘脑海中的画面'
                : '从一个问题开始'
          }}
        </text>
        <text v-if="mode === 'text'" class="link" @tap="newConversation">新对话</text>
      </view>
      <view class="field">
        <textarea
          v-model="prompt"
          class="textarea"
          auto-height
          :maxlength="selected?.promptMaxChars || -1"
          :cursor-spacing="28"
          placeholder="描述主体、风格、光线与氛围，细节会让创作更出色…"
        />
      </view>
      <view class="field">
        <text class="label">模型</text>
        <picker
          :range="available"
          range-key="name"
          :value="
            Math.max(
              0,
              available.findIndex((m) => m.id === selectedId),
            )
          "
          :disabled="submitting || uploading"
          @change="selectModel"
        >
          <view class="select">
            {{ selected?.name || '暂无可用模型' }}
            <text class="muted">⌄</text>
          </view>
        </picker>
      </view>
      <view v-if="!available.length" class="empty">
        {{ loading ? '正在读取模型…' : '此类型暂无可用模型' }}
        <text class="link" @tap="refresh">刷新</text>
      </view>
      <view v-if="maxImages" class="field">
        <text class="label">
          参考图 {{ references.length }}/{{ maxImages
          }}{{ mode === 'video' ? ' · 按顺序作为首帧 / 后续参考帧' : '' }}
        </text>
        <view class="refs">
          <view v-for="(image, index) in references" :key="image.id">
            <image :src="image.preview" mode="aspectFill" />
            <text
              class="link small"
              @tap="!submitting && !uploading && references.splice(index, 1)"
            >
              移除 {{ index + 1 }}
            </text>
          </view>
          <button
            v-if="references.length < maxImages"
            class="secondary"
            :disabled="uploading || submitting"
            @tap="addImage"
          >
            {{ uploading ? '上传中…' : '+ 参考图' }}
          </button>
        </view>
      </view>
      <view v-if="fields.length" class="field">
        <text class="link" @tap="showParameters = true">调整生成参数</text>
      </view>
      <view v-if="showParameters" class="sheet-mask" @tap="showParameters = false">
        <view class="sheet" @tap.stop>
          <view class="row between">
            <text class="section-title">生成参数</text>
            <text class="link" @tap="showParameters = false">完成</text>
          </view>
          <scroll-view scroll-y class="sheet-body">
            <view v-for="field in fields" :key="field.key" class="field">
              <text class="label">{{ field.label }}</text>
              <picker
                :range="field.values"
                :value="Math.max(0, field.values.indexOf(options[field.key] as string))"
                :disabled="submitting"
                @change="selectOption(field.key, field.values, $event)"
              >
                <view class="select">{{ options[field.key] }} ⌄</view>
              </picker>
            </view>
          </scroll-view>
        </view>
      </view>
      <button
        class="primary"
        :disabled="!selected || !prompt.trim() || submitting || uploading"
        :loading="submitting"
        @tap="submit"
      >
        {{ submitting ? '正在提交…' : '开始生成 →' }}
      </button>
      <view class="footer-note">任务在后台执行。最终消耗以积分账务为准。</view>
    </view>
    <view v-if="textTask" class="card">
      <view class="row between">
        <text class="section-title">文本回复</text>
        <text v-if="textResult" class="link" @tap="uni.setClipboardData({ data: textResult })">
          复制
        </text>
      </view>
      <view class="pre">{{ textResult || '等待模型回复…' }}</view>
    </view>
    <view class="section-title">最近创作</view>
    <view v-if="!currentTasks.length" class="empty">还没有创作记录。让第一个想法在这里发生。</view>
    <TaskCard v-for="task in currentTasks.slice(0, 8)" :key="task.id" :task="task" />
  </view>
</template>
<style scoped>
.refs {
  display: flex;
  gap: 16rpx;
  flex-wrap: wrap;
  align-items: center;
}
.refs image {
  width: 120rpx;
  height: 120rpx;
  border-radius: 12rpx;
  display: block;
}
.pre {
  margin-top: 24rpx;
}
.sheet-mask {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.65);
  display: flex;
  align-items: flex-end;
}
.sheet {
  width: 100%;
  background: #1a1d25;
  border-radius: 28rpx 28rpx 0 0;
  padding: 32rpx 30rpx calc(40rpx + env(safe-area-inset-bottom));
}
.sheet-body {
  max-height: 60vh;
}
</style>
