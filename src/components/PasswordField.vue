<script setup lang="ts">
import { ref } from 'vue';
defineProps<{ modelValue: string; label?: string; placeholder?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string] }>();
const visible = ref(false);
function input(event: Event) {
  emit('update:modelValue', (event as unknown as { detail: { value: string } }).detail.value);
}
</script>
<template>
  <view class="field">
    <text class="label">{{ label || '密码' }}</text>
    <view class="password">
      <input
        class="input"
        :value="modelValue"
        :password="!visible"
        :placeholder="placeholder || '至少 8 位密码'"
        :maxlength="128"
        @input="input"
      />
      <text class="reveal" @tap="visible = !visible">{{ visible ? '隐藏' : '显示' }}</text>
    </view>
  </view>
</template>
