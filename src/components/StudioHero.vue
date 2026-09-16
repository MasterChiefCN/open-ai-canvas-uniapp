<script setup lang="ts">
defineProps<{ title: string; subtitle: string; accent?: string; wallet?: boolean }>();
</script>
<template>
  <view class="studio-hero" :class="{ 'wallet-hero': wallet }">
    <view class="planet-halo" />
    <view class="planet" />
    <view v-if="wallet" class="planet-ring" />
    <view class="hero-star star-one">✦</view>
    <view class="hero-star star-two">·</view>
    <view class="hero-copy">
      <view class="hero-title">
        {{ title }}
        <text v-if="accent" class="hero-accent">{{ accent }}</text>
      </view>
      <view class="hero-subtitle">{{ subtitle }}</view>
    </view>
  </view>
</template>
<style scoped>
.studio-hero {
  position: relative;
  overflow: hidden;
  min-height: 192rpx;
  display: flex;
  align-items: center;
  margin: 0 -8rpx;
  padding: 26rpx 8rpx 34rpx;
}
.hero-copy {
  position: relative;
  z-index: 1;
}
.hero-title {
  font-size: 52rpx;
  font-weight: 700;
  letter-spacing: -2rpx;
  line-height: 1.25;
}
.hero-accent {
  color: #a68aff;
}
.hero-subtitle {
  font-size: 27rpx;
  color: #aabddd;
  margin-top: 14rpx;
}
.planet {
  position: absolute;
  width: 350rpx;
  height: 350rpx;
  right: -110rpx;
  top: 35rpx;
  border-radius: 50%;
  transform: rotate(-28deg);
  background: radial-gradient(
    ellipse at 30% 0%,
    #799dec 0%,
    #233e70 7%,
    #10203e 21%,
    #080f1b 45%,
    #080e18 72%
  );
  box-shadow:
    -3rpx -5rpx 5rpx #a5c9ff,
    -8rpx -10rpx 28rpx #477eed80,
    inset 0 12rpx 19rpx #7595cb80;
  opacity: 0.8;
}
.planet-halo {
  position: absolute;
  right: -10rpx;
  top: 20rpx;
  width: 340rpx;
  height: 210rpx;
  border-radius: 50%;
  background: radial-gradient(ellipse, #2d57ad55, #0b142000 70%);
}
.hero-star {
  position: absolute;
  color: #b0d6ff;
  text-shadow: 0 0 12rpx #5992ff;
}
.star-one {
  right: 265rpx;
  top: 16rpx;
  font-size: 19rpx;
}
.star-two {
  right: 60rpx;
  top: 5rpx;
}
.wallet-hero .planet {
  width: 142rpx;
  height: 142rpx;
  right: 43rpx;
  top: 20rpx;
  background: radial-gradient(circle at 30% 25%, #7e89ec, #263186 35%, #0c1533 75%);
  box-shadow:
    inset 0 0 18rpx #79a3ff,
    0 0 28rpx #545bed60;
}
.planet-ring {
  position: absolute;
  width: 208rpx;
  height: 53rpx;
  right: 10rpx;
  top: 68rpx;
  border: 3rpx solid #909bff;
  border-radius: 50%;
  transform: rotate(-28deg);
  box-shadow:
    0 0 12rpx #6377ff,
    inset 0 0 8rpx #7589ff;
}
.wallet-hero .hero-title {
  font-size: 48rpx;
}
</style>
