<script setup lang="ts">
import { ref, watch, getCurrentInstance, onBeforeUnmount } from 'vue';
import { onHide, onShow } from '@dcloudio/uni-app';
import type { MediaResult } from '../adapters/open-ai-canvas/task-result';
import { mediaAccess, mediaUrl, saveMedia } from '../services/media';
import { notifyError } from '../composables/usePage';
const props = defineProps<{ media: MediaResult }>();
const url = ref('');
const error = ref('');
const saving = ref(false);
let revision = 0;
let retried = false;
let hidden = false;
let refreshTimer: ReturnType<typeof setTimeout> | undefined;
function stopRefresh() {
  if (refreshTimer) clearTimeout(refreshTimer);
  refreshTimer = undefined;
}
async function load() {
  const current = ++revision;
  stopRefresh();
  error.value = '';
  try {
    const access = await mediaAccess(props.media);
    if (current !== revision || hidden) return;
    url.value = access.url;
    const delay = Date.parse(access.refreshAt || '') - Date.now();
    if (Number.isFinite(delay) && delay > 0)
      refreshTimer = setTimeout(load, Math.min(delay, 2147483647));
  } catch (failure) {
    if (current === revision)
      error.value = failure instanceof Error ? failure.message : '媒体加载失败';
  }
}
watch(
  () => props.media,
  () => {
    retried = false;
    void load();
  },
  { immediate: true },
);
function mediaError() {
  if (!retried && !hidden) {
    retried = true;
    void load();
  } else error.value = '媒体加载失败，请刷新地址或检查格式';
}
onHide(() => {
  hidden = true;
  revision++;
  stopRefresh();
  uni.createVideoContext('result-video').pause();
}, getCurrentInstance()?.root);
onShow(() => {
  if (hidden) {
    hidden = false;
    retried = false;
    void load();
  }
}, getCurrentInstance()?.root);
onBeforeUnmount(() => {
  revision++;
  stopRefresh();
  url.value = '';
});
async function preview() {
  try {
    const current = await mediaUrl(props.media);
    uni.previewImage({ urls: [current] });
  } catch (failure) {
    notifyError(failure);
  }
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  try {
    await saveMedia(props.media);
    uni.showToast({ title: '已保存到相册', icon: 'success' });
  } catch (failure) {
    notifyError(failure);
  } finally {
    saving.value = false;
  }
}
</script>
<template>
  <view class="media">
    <image
      v-if="url && media.kind === 'image'"
      class="media-image"
      :src="url"
      mode="widthFix"
      @tap="preview"
      @error="mediaError"
    />
    <video
      v-if="url && media.kind === 'video'"
      id="result-video"
      class="media-image"
      :src="url"
      controls
      @error="mediaError"
    />
    <view v-if="error" class="error">{{ error }}</view>
    <view class="row">
      <button class="secondary" @tap="load">刷新地址</button>
      <button class="secondary" :disabled="saving" @tap="save">
        {{ saving ? '保存中…' : '保存到相册' }}
      </button>
    </view>
  </view>
</template>
<style scoped>
.media {
  margin-top: 24rpx;
}
.media .row {
  margin-top: 20rpx;
}
</style>
