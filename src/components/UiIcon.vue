<script setup lang="ts">
withDefaults(defineProps<{ name: string; size?: number }>(), { size: 40 });
</script>
<template>
  <image
    class="ui-icon"
    :src="`/static/icons/${name}.png`"
    :style="{ width: `${size}rpx`, height: `${size}rpx` }"
    mode="aspectFit"
  />
</template>
<style scoped>
.ui-icon {
  display: inline-block;
  flex-shrink: 0;
  vertical-align: middle;
}
</style>
