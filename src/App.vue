<script setup lang="ts">
import { onShow, onHide } from '@dcloudio/uni-app';
import { setForeground } from './services/task-polling';
onShow(() => setForeground(true));
onHide(() => setForeground(false));
</script>
<style>
@import './styles/base.css';
</style>
