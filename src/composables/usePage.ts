import { ref } from 'vue';
import { onHide, onShow, onUnload } from '@dcloudio/uni-app';
import { useAuth } from '../stores/auth';
import { StaleRequestError } from '../core/http';
export function usePage(load: () => Promise<void>, hide?: () => void) {
  const error = ref('');
  const loading = ref(false);
  async function refresh() {
    loading.value = true;
    error.value = '';
    try {
      if (await useAuth().requireUser()) await load();
    } catch (failure) {
      if (!(failure instanceof StaleRequestError))
        error.value = failure instanceof Error ? failure.message : '加载失败';
    } finally {
      loading.value = false;
      uni.stopPullDownRefresh();
    }
  }
  onShow(refresh);
  onHide(() => hide?.());
  onUnload(() => hide?.());
  return { error, loading, refresh };
}
export function notifyError(error: unknown) {
  if (!(error instanceof StaleRequestError))
    uni.showToast({
      title: error instanceof Error ? error.message : '操作失败',
      icon: 'none',
      duration: 3500,
    });
}
