<script setup lang="ts">
import { computed, ref, getCurrentInstance, onMounted, onBeforeUnmount } from 'vue';
import { onShow, onHide, onUnload } from '@dcloudio/uni-app';
import { authApi } from '../api/auth';
import { brandConfig } from '../config/brand';
import { useAuth } from '../stores/auth';
import { configurationError } from '../core/urls';
import { ApiError } from '../core/http';
import { storage } from '../core/storage';
import type { AuthSettings } from '../types/backend';
import PasswordField from './PasswordField.vue';
const props = defineProps<{ mode: 'login' | 'register' | 'reset' }>();
const username = ref('');
const displayName = ref('');
const email = ref('');
const code = ref('');
const password = ref('');
const confirm = ref('');
const settings = ref<AuthSettings>();
const busy = ref(false);
const sending = ref(false);
const error = ref(configurationError());
const notice = ref('');
const now = ref(Date.now());
const step = ref(1);
const auth = useAuth();
let timer: ReturnType<typeof setInterval> | undefined;
const deadline = ref(0);
const submitDeadline = ref(0);
const seconds = computed(() => Math.max(0, Math.ceil((deadline.value - now.value) / 1000)));
const submitSeconds = computed(() =>
  Math.max(0, Math.ceil((submitDeadline.value - now.value) / 1000)),
);
const closed = computed(
  () => props.mode === 'register' && settings.value?.registrationEnabled === false,
);
const mailUnavailable = computed(
  () =>
    props.mode === 'register' &&
    settings.value &&
    !settings.value.firstUser &&
    settings.value.emailCodeRequired &&
    !settings.value.emailEnabled,
);
const title = computed(() =>
  props.mode === 'login'
    ? '进入创作现场'
    : props.mode === 'register'
      ? '建立你的创作空间'
      : '找回你的账号',
);
const eyebrow = computed(() =>
  props.mode === 'login'
    ? 'WELCOME BACK'
    : props.mode === 'register'
      ? 'CREATE ACCOUNT'
      : 'RESET PASSWORD',
);
const codeNeeded = computed(
  () => props.mode === 'reset' || (settings.value?.emailCodeRequired && !settings.value.firstUser),
);
const deadlineKey = `email-code:${props.mode}`;
function stop() {
  if (timer) clearInterval(timer);
  timer = undefined;
}
async function initialize() {
  now.value = Date.now();
  deadline.value = storage.get<number>(deadlineKey) || 0;
  stop();
  timer = setInterval(() => {
    now.value = Date.now();
  }, 1000);
  if (configurationError()) return;
  try {
    settings.value = await authApi.settings();
    if (props.mode === 'login' && (await auth.restore()))
      uni.switchTab({ url: '/pages/create/index' });
  } catch (failure) {
    error.value = failure instanceof Error ? failure.message : '读取配置失败';
  }
}
// 认证表单是子组件：挂载时初始化，页面返回前台时恢复倒计时。
const pageInstance = getCurrentInstance()?.root;
onMounted(initialize);
onShow(() => {
  now.value = Date.now();
  if (!timer)
    timer = setInterval(() => {
      now.value = Date.now();
    }, 1000);
}, pageInstance);
onHide(stop, pageInstance);
onUnload(stop, pageInstance);
onBeforeUnmount(stop);
function validateEmail() {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim())) throw new Error('请输入有效邮箱');
}
async function sendCode() {
  if (sending.value || seconds.value > 0) return;
  sending.value = true;
  error.value = '';
  notice.value = '';
  try {
    validateEmail();
    await authApi.sendCode(email.value.trim(), props.mode === 'reset');
    deadline.value = Date.now() + 60000;
    storage.set(deadlineKey, deadline.value);
    notice.value =
      props.mode === 'reset'
        ? '如果该邮箱已绑定可找回的账号，验证码将发送到邮箱'
        : '验证码已发送，请检查邮箱';
    step.value = 2;
  } catch (failure) {
    if (failure instanceof ApiError && (failure.status === 429 || failure.code === 429)) {
      deadline.value = Date.now() + failure.retryAfterMs;
      storage.set(deadlineKey, deadline.value);
    }
    error.value = failure instanceof Error ? failure.message : '发送失败';
  } finally {
    sending.value = false;
  }
}
async function submit() {
  if (busy.value || submitSeconds.value || closed.value || mailUnavailable.value) return;
  busy.value = true;
  error.value = '';
  notice.value = '';
  try {
    if (props.mode === 'login') {
      if (!username.value.trim() || !password.value) throw new Error('请填写用户名 / 邮箱和密码');
      await auth.authenticate(() => authApi.login(username.value.trim(), password.value));
    } else {
      if (props.mode === 'register' && !settings.value) throw new Error('请先成功加载注册设置');
      if (props.mode === 'register' && !/^[a-zA-Z0-9_-]{3,32}$/.test(username.value.trim()))
        throw new Error('用户名需为 3–32 位字母、数字、下划线或连字符');
      if (props.mode === 'reset' || !settings.value?.firstUser || email.value.trim())
        validateEmail();
      if (codeNeeded.value && !/^\d{6}$/.test(code.value)) throw new Error('请输入 6 位验证码');
      if (password.value.length < 8) throw new Error('密码至少 8 位');
      if (password.value !== confirm.value) throw new Error('两次密码不一致');
      if (props.mode === 'register')
        await auth.authenticate(() =>
          authApi.register({
            username: username.value.trim(),
            displayName: displayName.value.trim(),
            email: email.value.trim(),
            emailCode: codeNeeded.value ? code.value : '',
            password: password.value,
          }),
        );
      else {
        await authApi.reset(email.value.trim(), code.value, password.value);
        auth.clear();
        uni.reLaunch({ url: '/pages/auth/login' });
        uni.showToast({ title: '密码已重置', icon: 'success' });
      }
    }
    password.value = '';
    confirm.value = '';
    code.value = '';
  } catch (failure) {
    if (failure instanceof ApiError && (failure.status === 429 || failure.code === 429))
      submitDeadline.value = Date.now() + failure.retryAfterMs;
    error.value = failure instanceof Error ? failure.message : '操作失败';
  } finally {
    busy.value = false;
  }
}
function go(page: string) {
  uni.redirectTo({ url: '/pages/auth/' + page });
}
</script>
<template>
  <view class="page auth">
    <view class="auth-brand">◈ {{ brandConfig.name }}</view>
    <view class="eyebrow">{{ eyebrow }}</view>
    <view class="title">{{ title }}</view>
    <view class="subtitle">让灵感成为作品。文字、图像与视频，从这里开始。</view>
    <view class="card">
      <view v-if="error" class="error">
        {{ error }}
        <text v-if="!settings && !configurationError()" class="link" @tap="initialize">
          重新加载
        </text>
      </view>
      <view v-if="notice" class="notice">{{ notice }}</view>
      <view v-if="closed" class="notice">当前实例暂未开放注册。</view>
      <view v-if="mailUnavailable" class="notice">
        注册需要邮箱验证，但邮件服务暂不可用，请联系管理员。
      </view>
      <view v-if="mode === 'register' && settings?.firstUser" class="notice">
        当前为实例初始化，首个账号将按后端规则创建。
      </view>
      <view v-if="mode !== 'reset'" class="field">
        <text class="label">{{ mode === 'login' ? '用户名 / 邮箱' : '用户名' }}</text>
        <input
          v-model="username"
          class="input"
          :placeholder="mode === 'login' ? '用户名或邮箱' : '3–32 位字母、数字、_ 或 -'"
          :maxlength="mode === 'login' ? 254 : 32"
        />
      </view>
      <view v-if="mode === 'register'" class="field">
        <text class="label">显示名称 · 选填</text>
        <input
          v-model="displayName"
          class="input"
          placeholder="你希望大家如何称呼你"
          :maxlength="64"
        />
      </view>
      <view v-if="mode !== 'login'" class="field">
        <text class="label">
          邮箱{{ settings?.firstUser && mode === 'register' ? ' · 选填' : '' }}
        </text>
        <input v-model="email" class="input" placeholder="creator@example.com" :maxlength="254" />
      </view>
      <view v-if="mode !== 'login' && codeNeeded" class="field">
        <text class="label">邮箱验证码</text>
        <view class="row">
          <input
            v-model="code"
            class="input grow"
            type="number"
            :maxlength="6"
            placeholder="6 位验证码"
          />
          <button
            class="secondary"
            :disabled="sending || seconds > 0 || !settings?.emailEnabled || closed"
            @tap="sendCode"
          >
            {{ seconds ? seconds + '秒' : sending ? '发送中' : '发送验证码' }}
          </button>
        </view>
      </view>
      <template v-if="mode !== 'reset' || step === 2">
        <PasswordField
          v-model="password"
          :label="mode === 'reset' ? '新密码' : '密码'"
          :placeholder="mode === 'login' ? '输入密码' : '至少 8 位密码'"
        />
        <PasswordField
          v-if="mode !== 'login'"
          v-model="confirm"
          label="确认密码"
          placeholder="再次输入密码"
        />
      </template>
      <button
        v-if="mode !== 'reset' || step === 2"
        class="primary"
        :disabled="
          busy ||
          !!configurationError() ||
          closed ||
          !!mailUnavailable ||
          submitSeconds > 0 ||
          (mode === 'register' && !settings)
        "
        :loading="busy"
        @tap="submit"
      >
        {{
          submitSeconds
            ? submitSeconds + ' 秒后重试'
            : mode === 'login'
              ? '登录，开始创作'
              : mode === 'register'
                ? '建立账号'
                : '重置密码'
        }}
      </button>
      <text v-if="mode === 'reset' && step === 1" class="muted">
        发送验证码后设置新密码。
        <text class="link" @tap="step = 2">已有验证码</text>
      </text>
      <view class="auth-links">
        <text class="link" @tap="go(mode === 'login' ? 'register' : 'login')">
          {{ mode === 'login' ? '建立新账号' : '返回登录' }}
        </text>
        <text v-if="mode === 'login'" class="link" @tap="go('forgot-password')">忘记密码？</text>
      </view>
    </view>
    <view class="footer-note">与同一实例的 Web 端共享账号、任务和积分</view>
  </view>
</template>
