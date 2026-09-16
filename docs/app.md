# Android / iOS

本项目使用 uni-app Vue 3 的 App-Vue 渲染。Android 和 iOS 共用 `app` 目标资源，原生能力通过 uni API 和 HTML5+ Native.js 适配，不需要另建 Android/iOS 前端工程。

## 构建与运行

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm dev:app
# 发布资源
pnpm build:app
```

开发资源在 `dist/dev/app`，发布资源在 `dist/build/app`。命令自动同步品牌配置，创作页标题仍固定为“创作”。使用与编译器匹配的 HBuilderX/运行基座，导入生成目录后通过“运行到手机或模拟器”调试。Android 使用 USB 调试连接；iOS 使用相应的设备、基座和签名配置。修改原生模块或权限后需重新制作基座/安装包，不能仅热更新 JS。

`build:app` 已验证可生成资源，但不生成签名 APK/IPA。需要安装包时，在 HBuilderX 中配置 DCloud AppID，选择 Android 包名/签名证书或 iOS Bundle ID/证书及 profile，再使用 App 打包流程。也可将资源用于 DCloud 原生 SDK 离线打包。包名、证书及密码由部署者提供，不写入开源仓库。CLI 与 HBuilderX 的职责见 [DCloud CLI 文档](https://uniapp.dcloud.net.cn/worktile/CLI.html)。

## 配置与功能

| 项目       | 行为                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------- |
| 品牌       | `src/config/brand.ts`，中文/英文均可；应用描述使用跨平台文案                                          |
| 后端       | `src/config/backend.ts`，沿用完整 HTTPS API 根地址；App 无需微信合法域名名单                          |
| 应用身份   | 顶层 `manifest.appid` 为 DCloud AppID；微信的 `mp-weixin.appid` 独立保留                              |
| 相册和视频 | `app-plus.modules` 启用 Camera 和 VideoPlayer；图片可从相册/相机选取，视频从相册选取                  |
| 音频参考   | Android 系统文件选择器；iOS 文件选择器。每次一个，可重复添加至模型上限；支持 mp3/wav/m4a/aac/ogg/flac |
| Cookie     | 显式保存和发送业务会话；清除原生 Cookie 容器，防止其绕过账号/后端隔离；无会话时显式空 Cookie          |
| 任务与素材 | App 使用 `uniapp-app`，微信使用 `uniapp-wechat`；两类任务均能补同步到个人素材库                       |
| 前后台     | 沿用前台轮询、后台暂停、返回后刷新；不宣称可在后台持续轮询                                            |
| 外观       | 原生导航/TabBar、深色状态栏及底部安全区；横屏用于视频全屏，页面沿用响应式宽度                         |

音频选择不需要读取整个存储空间的权限。Android 将用户选中的 content URI 复制到应用缓存，并在复制中限制大小；iOS 使用 Import 模式复制到应用沙箱。上传结束或失败后清理此次导入的临时文件，不删除用户原文件。云端文件需先由系统下载到本地；文件扩展名过滤不能替代后端 MIME/内容校验。

相册读取、写入和相机的用途说明已加入 iOS 配置；Android 新版图片/视频权限显式配置，旧版读写存储权限由 DCloud 云打包自动加入，不在 `permissions` 中重复声明。实际权限弹窗随系统版本、基座和用户授权状态变化。拒绝权限时显示系统设置提示。未加入音频录制、麦克风权限、定位或后台服务。

若云打包在 `:includePermissions:processReleaseManifest` 报 `WRITE_EXTERNAL_STORAGE duplicated`，检查是否手动添加了带 `maxSdkVersion` 的同名权限。删除额外的读写存储权限声明，重新运行 `pnpm build:app`，再提交新的完整云打包。不要只编辑 `dist` 产物，也不要通过移除 Camera 模块规避冲突。DCloud 默认权限见 [Android 权限配置](https://uniapp.dcloud.io/tutorial/app-permission-android)。如需约束最终 APK 的权限属性，应使用 DCloud 支持的原生 Manifest 定制方式，并核对打包后的权限清单。

参考：[App 模块配置](https://uniapp.dcloud.io/tutorial/app-modules.html)、[视频组件](https://uniapp.dcloud.io/component/video)、[Native.js Android](https://www.html5plus.org/doc/zh_cn/android.html)、[Native.js iOS](https://www.html5plus.org/doc/zh_cn/ios.html)、[Cookie 容器](https://www.html5plus.org/doc/zh_cn/navigator.html)。

## 验证范围

已执行类型检查、离线测试、App 资源构建，以及微信小程序构建和原生 WXSS 编译。原生文件选择的自动化测试使用模拟桥接对象，覆盖取消、并发选择、文件大小和清理，不能证明真实设备上的桥接/权限行为。

2026-09-16，部署者提供 HBuilderX 控制台截图，确认修复存储权限重复声明后 Android 云打包成功并生成 APK。此结果不等于安装后的功能验收；iOS 签名打包尚未验证。

Android/iOS 真机功能、真实后端和应用商店发布仍待验收。至少在 Android 旧存储权限版本、Android 13/14+ 及 iPhone 上检查：

1. 登录、冷启动会话恢复、退出、账号切换；API 请求和上传 Cookie 一致，退出后不能复用原生旧会话。
2. 中文长品牌名、刘海/底部安全区、横屏、键盘弹出和密码输入；创作/任务/积分导航正常。
3. 图片/视频选择、拒绝和有限相册授权；音频选择/取消/再次选择、中文文件名、超限文件、云盘文件及 iOS 大小写扩展名。
4. 三类生成、前后台切换后进度恢复、已有任务重新入库、跨 App/微信的同账号素材可见。
5. 图片预览、视频播放和全屏、相册保存、拒绝保存权限、签名 URL 过期刷新。
6. 网络断开、生成结果未知、积分兑换、请求取消与迟到响应；真实计费测试需指定账号和额度。

设备差异（尤其 iOS 文件提供器和 Android 厂商文件管理器）须以真机结果为准。生产安装包的图标、启动图、包名、签名、隐私政策及商店资料由部署者补齐。
