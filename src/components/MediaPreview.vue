<script setup lang="ts">
import { ref, watch, getCurrentInstance, onBeforeUnmount } from 'vue';
import { onHide } from '@dcloudio/uni-app';
import type { MediaResult } from '../adapters/open-ai-canvas/task-result';
import { mediaUrl, saveMedia } from '../services/media';
import { notifyError } from '../composables/usePage';
const props = defineProps<{ media: MediaResult }>();
const url = ref('');
const error = ref('');
const saving = ref(false);
let revision = 0;
async function load() {
  const current = ++revision;
  error.value = '';
  try {
    const next = await mediaUrl(props.media);
    if (current === revision) url.value = next;
  } catch (failure) {
    if (current === revision)
      error.value = failure instanceof Error ? failure.message : '媒体加载失败';
  }
}
watch(() => props.media, load, { immediate: true });
onHide(() => {
  uni.createVideoContext('result-video').pause();
}, getCurrentInstance()?.root);
onBeforeUnmount(() => {
  revision++;
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
      @error="error = '媒体地址可能已过期，请刷新'"
    />
    <video
      v-if="url && media.kind === 'video'"
      id="result-video"
      class="media-image"
      :src="url"
      controls
      @error="error = '视频加载失败，请刷新地址或检查格式'"
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
