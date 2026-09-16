<script setup lang="ts">
import { computed } from 'vue';
import type { Task } from '../types/backend';
import { taskParameters } from '../adapters/open-ai-canvas/task-details';
const props = defineProps<{ task: Task }>();
const values = computed(() => taskParameters(props.task));
</script>
<template>
  <view v-if="values.length" class="card">
    <view class="section-title">生成参数</view>
    <view v-for="parameter in values" :key="parameter.label" class="row between">
      <text class="muted">{{ parameter.label }}</text>
      <text>{{ parameter.value }}</text>
    </view>
  </view>
</template>
