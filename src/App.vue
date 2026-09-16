<script setup lang="ts">
import { onLaunch, onShow, onHide } from '@dcloudio/uni-app';
import { clearNativeCookies } from './core/runtime';
import { setForeground } from './services/task-polling';
// Cookie 以按后端隔离的本地会话为准，不恢复原生 Cookie 容器中的旧账号。
onLaunch(clearNativeCookies);
onShow(() => setForeground(true));
onHide(() => setForeground(false));
</script>
<style>
@import './styles/base.css';
</style>
