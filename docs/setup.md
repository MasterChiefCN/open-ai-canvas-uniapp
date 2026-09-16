# 开发与部署

## 环境

本地验证：Windows、Node.js 24.19.0、pnpm 11.19.0。DCloud 编译器依赖统一固定为 `3.0.0-5020420260813003`，工程依据 [DCloud Vue 3 CLI 文档](https://uniapp.dcloud.net.cn/quickstart-cli)。

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm build:mp-weixin
pnpm check:wxss
pnpm build:app
```

不要混用包管理器和锁文件。`pnpm-workspace.yaml` 允许 esbuild 与 vue-demi 的安装构建脚本；core-js 的安装提示脚本关闭。不需要初始化数据库、BFF 或 uniCloud。

`check:wxss` 使用微信开发者工具自带的原生样式编译器，默认寻找 Windows 常规安装路径；其他安装位置可通过 `WXSS_COMPILER` 指定编译器。检查开发产物可运行 `pnpm check:wxss dist/dev/mp-weixin`。它不会启动开发者工具或请求后端。uni-app 构建成功后仍应执行该检查，避免浏览器 CSS 语法进入 WXSS。

## 业务后端配置

唯一入口为 `src/config/backend.ts` 的 `apiBaseUrl`。使用包含 `/api` 前缀的 HTTPS 地址，移除末尾斜杠。业务调用方只传相对路径，更换地址后重新编译。

HTTPS 或占位地址检查失败时显示配置提示，不尝试外部连接。认证、生成、积分、上传和签名请求共享配置。资源地址区分根相对路径与 API 相对路径。

新实例使用不同缓存命名空间。账号缓存进一步按用户 ID 隔离，退出会清除当前用户的本地草稿与任务 ID；服务端作品不受影响。

## 微信配置

Android/iOS 原生 App 的配置及签名打包见 [App 部署说明](app.md)。以下微信合法域名配置只用于微信小程序。

1. 将微信 AppID 填入 `src/manifest.json` 的 `mp-weixin.appid`。顶层 `appid` 是 DCloud 应用标识，不是微信 AppID。
2. 微信公众平台配置 API 的 request/uploadFile 合法域名；downloadFile 合法域名需包含实际 OSS/CDN 域名。
3. 确认媒体 HTTPS 地址、证书、格式和重定向均适用于微信，签名媒体不能依赖额外 Cookie。
4. 开发运行 `pnpm dev:mp-weixin`，导入 `dist/dev/mp-weixin`；发布运行 `pnpm build:mp-weixin`，导入 `dist/build/mp-weixin`。
5. 开发者工具和 iOS/Android 微信分别执行验收。临时关闭域名校验不能代替合法域名配置。

仓库 AppID 为空，离线构建会提示未配置 AppID；这不影响产物生成，发布前必须配置。未接入 uni 统计。

## 后端前提

通过既有 Web 管理后台初始化管理员、设置注册/SMTP、启用模型、配置能力与可用价格、设置积分和测试兑换码。小程序不会修改这些设置。

登录采用 `open_ai_canvas_session` Cookie；需真机确认 cookies/Set-Cookie 可被读取、上传携带、到期清理。后端应以直接可访问的 API 域名提供接口，避免携带会话的 API 请求跳转至其他主机。

参考图片、视频、音频均上传到业务 API 的 `/resources`，随后单条写入个人 `/assets/:id`，不是直接上传到 CDN。后端配置 COS/CDN 不会替代小程序的 `uploadFile` 合法域名配置；上传域名须包含业务 API 域名，读取媒体所需的真实 OSS/CDN 域名也须配置。入库失败时在创作页“重试入库”，无需重新选文件；上传本身失败（如域名校验失败）则尚未进入素材同步流程。

## 常见问题

- 配置提示：占位地址未替换、未使用 HTTPS 或末尾多了斜杠。
- 非 JSON 响应：检查 API 前缀和代理 HTML 错误页，不应绕过业务信封校验。
- 无可用模型：检查后端目录、路由、能力与协议配置，以及所选模式。
- 兑换/生成超时：先刷新任务或钱包核对；写操作没有自动重试。
- 媒体失败：详情刷新签名地址，检查合法域名、签名与格式。
- 保存权限拒绝：在小程序设置重新开启相册权限。

当前依赖保持 DCloud 该版模板兼容组合，vue-i18n 9 安装时有维护期提示；升级编译器及配套依赖时应重新执行构建与真机回归。
