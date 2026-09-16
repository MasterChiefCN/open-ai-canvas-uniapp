<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { uni } from '../../core/platform';
import { audioPickerHint } from '../../core/runtime';
import { modelApi } from '../../api/models';
import {
  chooseReferences,
  uploadReference,
  referenceUploadStates,
  syncReferenceAsset,
  resumeReferenceAssets,
  type SelectedReference,
} from '../../services/reference-upload';
import { mediaDimensions } from '../../services/asset-sync';
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
import { storage } from '../../core/storage';
import { assertEpoch, requestEpoch } from '../../core/http';
import type { Mode, Model, ImageReference, MediaReferences, MediaKind } from '../../types/backend';
import TaskCard from '../../components/TaskCard.vue';
import StudioHeader from '../../components/StudioHeader.vue';
import StudioHero from '../../components/StudioHero.vue';
import UiIcon from '../../components/UiIcon.vue';
const auth = useAuth();
const tasks = useTasks();
const wallet = useWallet();
const mode = ref<Mode>('image');
const prompt = ref('');
const models = ref<Model[]>([]);
const selectedId = ref('');
const options = ref<Record<string, unknown>>({});
const references = ref<Array<ImageReference & { preview: string }>>([]);
const media = ref<MediaReferences>({ videos: [], audios: [] });
const uploadStates = computed(() => Object.values(referenceUploadStates));
const mediaGroups = computed(() =>
  (['video', 'audio'] as const)
    .map((kind) => ({
      kind,
      label: kind === 'video' ? '视频' : '音频',
      max: selected.value?.spec.inputs?.[kind]?.max || 0,
      items: kind === 'video' ? media.value.videos : media.value.audios,
    }))
    .filter((group) => group.max > 0),
);
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
const suggestions = computed(() =>
  mode.value === 'video'
    ? ['一只猫在樱花树下漫步', '未来城市的航拍镜头']
    : mode.value === 'image'
      ? ['雨后绽放的白色山茶花', '漂浮在云海中的鲸鱼']
      : ['写一段温暖的旅行文案', '帮我构思一个科幻故事'],
);
function useSuggestion(value: string) {
  if (submitting.value || uploading.value) return;
  prompt.value = selected.value?.promptMaxChars
    ? value.slice(0, selected.value.promptMaxChars)
    : value;
}
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
  media.value = { videos: [], audios: [] };
});
watch(selectedId, () => {
  options.value = defaultParameters(selected.value);
  references.value = [];
  media.value = { videos: [], audios: [] };
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
  media.value = { videos: [], audios: [] };
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
    void resumeReferenceAssets().catch(() => {});
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
async function addReference(kind: MediaKind) {
  if (uploading.value || submitting.value || !selected.value) return;
  const model = selected.value;
  const epoch = requestEpoch();
  const items = kind === 'video' ? media.value.videos : media.value.audios;
  const remaining =
    (model.spec.inputs?.[kind]?.max || 0) -
    (kind === 'image' ? references.value.length : items.length);
  if (remaining <= 0) return;
  uploading.value = true;
  let files: SelectedReference[] = [];
  try {
    const runtimeMax = (auth.session.runtimeLimits?.resourceUploadMB || 50) * 1024 * 1024;
    const modelMax =
      kind === 'image'
        ? model.maxImageBytes
        : kind === 'video'
          ? model.maxVideoBytes
          : model.maxAudioBytes;
    const limit = modelMax ? Math.min(runtimeMax, modelMax) : runtimeMax;
    files = await chooseReferences(kind, remaining, limit);
    for (const file of files.slice(0, remaining)) {
      assertEpoch(epoch);
      if (file.size > limit)
        throw new Error(`参考素材超出上传限制（${Math.floor(limit / 1024 / 1024)} MB）`);
      const durationMax = model.rawCapabilities?.[model.mode]?.references;
      const seconds =
        kind === 'video'
          ? durationMax?.maxVideoDurationSeconds
          : kind === 'audio'
            ? durationMax?.maxAudioDurationSeconds
            : 0;
      if (seconds && file.durationMs && file.durationMs > seconds * 1000)
        throw new Error(`参考素材时长不能超过 ${seconds} 秒`);
      const dimensions = kind === 'image' ? await mediaDimensions('image', file.path) : {};
      assertEpoch(epoch);
      const resource = await uploadReference(file.path, kind, file.name, {
        ...dimensions,
        ...(kind === 'video'
          ? { width: file.width, height: file.height, durationMs: file.durationMs }
          : {}),
      });
      assertEpoch(epoch);
      if (selectedId.value !== model.id)
        throw new Error('模型已切换，素材已上传，请重新选择参考素材');
      const reference = {
        id: resource.id,
        name: file.name,
        type: resource.mimeType,
        storageKey: `resource:${resource.id}`,
        bytes: resource.size,
      };
      if (kind === 'image')
        references.value.push({ ...reference, dataUrl: '', preview: file.path });
      else
        items.push({
          ...reference,
          url: '',
          width: resource.width,
          height: resource.height,
          durationMs: resource.durationMs,
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
    files.forEach((file) => file.cleanup?.());
    uploading.value = false;
  }
}
async function submit() {
  if (submitting.value || uploading.value || !selected.value) return;
  submitting.value = true;
  notice.value = '';
  error.value = '';
  try {
    validateModel(selected.value, prompt.value, references.value.length, options.value, {
      videos: media.value.videos.length,
      audios: media.value.audios.length,
    });
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
      media.value,
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
</script>
<template>
  <view class="page studio-page">
    <StudioHeader />
    <StudioHero title="把灵感变成" accent="作品" subtitle="用 AI 打开你的创意新世界" />
    <view v-if="error" class="error">{{ error }}</view>
    <view v-if="notice" class="notice">{{ notice }}</view>
    <view class="segment-control">
      <view
        v-for="item in modes"
        :key="item.key"
        class="segment-item"
        :class="{ active: mode === item.key }"
        @tap="changeMode(item.key)"
      >
        <UiIcon :name="item.key" :size="34" />
        <text>{{ item.label }}</text>
      </view>
    </view>
    <view class="creation-form">
      <view v-if="mode === 'text'" class="row between text-heading">
        <text class="section-title">从一个问题开始</text>
        <text class="link" @tap="newConversation">新对话</text>
      </view>
      <view class="prompt-panel">
        <textarea
          v-model="prompt"
          class="textarea"
          auto-height
          :maxlength="selected?.promptMaxChars || -1"
          :cursor-spacing="28"
          :placeholder="
            mode === 'video'
              ? '描述你想创作的视频内容…'
              : mode === 'image'
                ? '描述你想创作的画面…'
                : '写下你的问题或创作需求…'
          "
        />
        <view class="prompt-count">
          {{ prompt.length }}
          <text v-if="selected?.promptMaxChars">/ {{ selected.promptMaxChars }}</text>
        </view>
        <view class="prompt-suggestions">
          <text
            v-for="suggestion in suggestions"
            :key="suggestion"
            class="suggestion"
            @tap="useSuggestion(suggestion)"
          >
            {{ suggestion }}
          </text>
        </view>
      </view>
      <view class="config-card">
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
          <view class="config-row">
            <UiIcon name="model" />
            <text class="config-label">模型</text>
            <text class="config-value">{{ selected?.name || '暂无可用模型' }}</text>
            <text class="chevron">›</text>
          </view>
        </picker>
      </view>
      <view v-if="!available.length" class="empty">
        {{ loading ? '正在读取模型…' : '此类型暂无可用模型' }}
        <text class="link" @tap="refresh">刷新</text>
      </view>
      <view v-if="maxImages" class="config-card reference-card">
        <view class="config-row">
          <UiIcon name="image" />
          <view class="grow">
            <view>
              参考图
              <text class="muted small">{{ references.length }}/{{ maxImages }}</text>
            </view>
            <view class="muted small">
              {{ mode === 'video' ? '按顺序作为首帧 / 后续参考帧' : '让 AI 更懂你的想法' }}
            </view>
          </view>
          <button
            v-if="references.length < maxImages"
            class="upload-button"
            :disabled="uploading || submitting"
            @tap="addReference('image')"
          >
            <view class="upload-plus">＋</view>
            <text>{{ uploading ? '上传中…' : '上传图片' }}</text>
          </button>
        </view>
        <view v-if="references.length" class="refs">
          <view v-for="(image, index) in references" :key="image.id">
            <image :src="image.preview" mode="aspectFill" />
            <text
              class="link small"
              @tap="!submitting && !uploading && references.splice(index, 1)"
            >
              移除 {{ index + 1 }}
            </text>
          </view>
        </view>
      </view>
      <view v-for="group in mediaGroups" :key="group.kind" class="config-card reference-card">
        <view class="config-row">
          <view class="grow">
            <view>
              参考{{ group.label }}
              <text class="muted small">{{ group.items.length }}/{{ group.max }}</text>
            </view>
            <view class="muted small">
              {{ group.kind === 'audio' ? audioPickerHint() : '从相册选择视频' }}
            </view>
          </view>
          <button
            v-if="group.items.length < group.max"
            class="upload-button"
            :disabled="uploading || submitting"
            @tap="addReference(group.kind)"
          >
            <view class="upload-plus">＋</view>
            <text>上传{{ group.label }}</text>
          </button>
        </view>
        <view v-for="(item, index) in group.items" :key="item.id" class="config-row small">
          <text class="grow">{{ item.name }}</text>
          <text class="link" @tap="!submitting && !uploading && group.items.splice(index, 1)">
            移除
          </text>
        </view>
      </view>
      <view v-if="uploadStates.length" class="config-card reference-card">
        <view class="config-row small">
          参考素材上传后自动加入主项目素材库；移除引用不会删除素材。
        </view>
        <view v-for="item in uploadStates" :key="item.resource.id" class="config-row small">
          <view class="grow">
            <view>
              {{ item.name }} ·
              {{
                item.status === 'synced'
                  ? '已入库'
                  : item.status === 'syncing'
                    ? '正在入库…'
                    : '已上传，入库失败'
              }}
            </view>
            <view v-if="item.message" class="muted">{{ item.message }}</view>
          </view>
          <text v-if="item.status === 'error'" class="link" @tap="syncReferenceAsset(item)">
            重试入库
          </text>
        </view>
      </view>
      <view v-if="fields.length" class="config-card config-row" @tap="showParameters = true">
        <UiIcon name="sliders" />
        <view class="grow">
          <view>生成参数</view>
          <view class="muted small">调整尺寸、质量等生成选项</view>
        </view>
        <text class="chevron">›</text>
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
        <view class="generate-label">
          <UiIcon name="sparkles" :size="40" />
          <text>{{ submitting ? '正在提交…' : '开始生成' }}</text>
          <text>→</text>
        </view>
      </button>
      <view class="footer-note">
        <view>生成完成后自动同步素材库，可在任务页查看状态</view>
        <view>最终消耗以积分账务为准</view>
      </view>
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
    <view class="section-heading">
      <text class="section-title">最近创作</text>
      <text
        v-if="auth.enabled('taskCenterEnabled')"
        class="link small"
        @tap="uni.switchTab({ url: '/pages/tasks/index' })"
      >
        查看全部 ›
      </text>
    </view>
    <view v-if="!currentTasks.length" class="empty">
      <UiIcon name="sparkles" :size="48" />
      <view class="empty-title">让第一个想法在这里发生</view>
      <text class="small">写下灵感，开始你的第一次创作</text>
    </view>
    <view class="recent-grid">
      <TaskCard v-for="task in currentTasks.slice(0, 4)" :key="task.id" :task="task" compact />
    </view>
  </view>
</template>
<style scoped>
.text-heading {
  margin: 22rpx 0;
}
.prompt-panel {
  border: 1rpx solid #637597;
  border-radius: 24rpx;
  padding: 24rpx;
  background: linear-gradient(125deg, #24344a, #1a2637 60%, #202a40);
  box-shadow: inset 0 0 12rpx #9a8ee025;
}
.prompt-panel .textarea {
  background: transparent;
  border: 0;
  padding: 0;
  min-height: 140rpx;
  height: 140rpx;
  font-size: 29rpx;
  line-height: 1.6;
}
.prompt-count {
  text-align: right;
  color: #7f94b4;
  font-size: 22rpx;
  margin: 10rpx 0 16rpx;
}
.prompt-suggestions {
  display: flex;
  flex-wrap: wrap;
  gap: 10rpx;
}
.suggestion {
  border: 1rpx solid #4a5c77;
  color: #a5b7cf;
  border-radius: 30rpx;
  padding: 6rpx 14rpx;
  font-size: 20rpx;
}
.config-card {
  margin-top: 16rpx;
  border: 1rpx solid #334358;
  border-radius: 22rpx;
  background: linear-gradient(125deg, #1d2a39, #141e2b 65%, #1b2533);
}
.config-row {
  display: flex;
  align-items: center;
  gap: 18rpx;
  padding: 22rpx;
  min-height: 88rpx;
}
.config-label {
  flex-shrink: 0;
}
.config-value {
  flex: 1;
  text-align: right;
  color: #c2d2ec;
  font-size: 26rpx;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.chevron {
  color: #90a3c0;
  font-size: 40rpx;
  line-height: 1;
}
.upload-button {
  margin: 0;
  padding: 8rpx 18rpx;
  background: #111b27;
  border: 1rpx dashed #4b5c75;
  border-radius: 16rpx;
  color: #96acca;
  font-size: 19rpx;
  line-height: 1.4;
  flex-shrink: 0;
}
.upload-plus {
  font-size: 36rpx;
}
.generate-label {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 26rpx;
}
.creation-form .primary {
  display: block;
  width: 100%;
}
.recent-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18rpx;
}
.reference-card .refs {
  padding: 0 22rpx 22rpx;
}
.creation-form .footer-note {
  padding: 18rpx 0 0;
  font-size: 20rpx;
}
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
  background: #152133;
  border-radius: 28rpx 28rpx 0 0;
  padding: 32rpx 30rpx calc(40rpx + env(safe-area-inset-bottom));
}
.sheet-body {
  max-height: 60vh;
}
</style>
