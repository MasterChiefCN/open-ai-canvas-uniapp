# Open AI Canvas UniApp

独立的 uni-app 微信小程序前端，复用 [Open AI Canvas](https://github.com/ddcat-ai/open-ai-canvas) 后端。使用 Vue 3、TypeScript、Pinia，不依赖 uniCloud，不嵌入 Web 页面。

当前状态：已实现首版页面与接口适配，可编译为微信小程序；已通过离线测试和类型检查。尚未连接真实后端、微信开发者工具或 iOS/Android 微信真机验收，不代表生产环境已验证。

## 快速开始

本地验证环境：Node.js 24.19.0、pnpm 11.19.0。固定依赖见 `pnpm-lock.yaml`。首次安装 pnpm 可运行 `npm install -g pnpm@11.19.0`。

```sh
pnpm install --frozen-lockfile
```

业务后端地址只修改 `src/config/backend.ts`：

```ts
export const backendConfig = Object.freeze({
  apiBaseUrl: 'https://your-domain.example/api',
});
```

替换为自己的 HTTPS API 根地址，包含 `/api`、不带尾部斜杠。占位地址会显示配置提示，不会访问默认演示站。没有 `.env` 地址覆盖。

在 `src/manifest.json` 的 `mp-weixin.appid` 设置微信小程序 AppID，然后运行：

```sh
pnpm dev:mp-weixin
# 发布构建
pnpm build:mp-weixin
```

用微信开发者工具导入 `dist/dev/mp-weixin`（开发）或 `dist/build/mp-weixin`（构建）。AppID、微信合法域名和后端 SMTP/模型/积分设置是独立配置项，详见 [部署说明](docs/setup.md)。

## 已实现

- 账号：用户名或邮箱密码登录、完整注册、邮件验证码、密码找回、Cookie 会话恢复与退出；深色单列表单、密码显隐、时间戳验证码倒计时。
- 创作：视频/图片/文本切换、逻辑模型与系统渠道目录、能力驱动参数底部面板、参考图上传、三类后台任务提交；文本回复、复制和继续提问。
- 任务：最近 100 条与活动任务合并、状态/类型/已加载内容搜索、任务详情、进度、图片缩略图、媒体预览/保存、安全日志摘要、取消与符合条件的重试。
- 积分：可用/预占余额、兑换、`all / income / consume / refund` 分类和真实分页；保留 microcredits 整数精度。
- 基础：单一 API 配置、统一信封解包、Cookie 到期/删除处理、实例与用户缓存隔离、旧请求取消和迟到响应丢弃、共享前后台轮询。

底部导航为“创作 / 任务 / 积分”。首页提供退出操作。任务中心与积分展示遵循会话功能开关。

首版不包含微信一键登录、OAuth、支付/充值、签到入口、音频生成、素材库独立页、项目/分镜、无限画布、Agent、时间线或后台管理。

## 验证命令

```sh
pnpm typecheck
pnpm test
pnpm build:mp-weixin
pnpm format:check
```

测试覆盖 Cookie、URL、业务错误、旧响应隔离、金额、模型/生成合同、批次部分失败、文本去重和结果解析。测试使用本地模拟数据，不会发起真实模型生成或消耗兑换码。

验收记录与待测项目见 [acceptance.md](docs/acceptance.md)。小程序编译通过不能代替微信运行与真机检查。

## 架构

```text
src/config/backend.ts          唯一业务后端地址
src/core/                      请求、Cookie、URL、隔离存储与金额格式化
src/api/                       auth / models / tasks / resources / wallet
src/adapters/open-ai-canvas/    模型能力、生成入参、结果与安全日志投影
src/services/                  生成编排、共享轮询、媒体获取和保存
src/stores/                    用户、任务、积分共享状态
src/components/                账号表单、参数、任务卡片、媒体组件
src/pages/                     七个页面
tests/                         离线合同与行为测试
```

页面不直接调用 `uni.request`，不处理 Cookie 或解析后端 `resultJson`。渠道模型请求使用系统 `channelId` 与协议；逻辑模型请求使用 `logicalModelId`，前端不持有供应商密钥。

## 兼容边界

静态参考上游提交 [9868f5e8](https://github.com/ddcat-ai/open-ai-canvas/tree/9868f5e8)，非已完成联调的兼容承诺。具体合同和源码证据见 [backend-compatibility.md](docs/backend-compatibility.md)。

- 缺少协议或能力配置的渠道模型不展示，不猜测其参数。面板提供后端声明的比例/尺寸、质量、时长、分辨率、数量；不开放供应商高级参数或自定义尺寸输入。
- 批量图片逐项提交后台任务；部分失败后保留成功任务并停止后续提交，不把超时当成“未创建”。重新提交前应核对任务列表。
- 文本历史和草稿保存在本地并按实例/账号隔离，退出会清除当前账号本地缓存。暂不提供多会话管理，也不与 Web 本地会话分组同步。
- 参考图上传为服务端资源；临时文件路径不作为跨启动引用保存。返回页面后保留提示词和文本上下文，参考图可能需要重新选择。
- 任务详情允许手动刷新签名媒体地址。保存需要相册权限以及正确的下载域名与格式；视频兼容性待真机验收。
- 任务列表没有历史游标，客户端“展开”只展示已加载集合；积分流水使用服务端分页。
- 结果查看/下载不代表已建立 Web 素材库业务记录。取消请求、上游取消确认和退款是不同状态。
- 当前只提供微信小程序构建；未宣称 H5 会话兼容或完成 H5 测试。

## 贡献与许可

请先阅读 [AGENTS.md](AGENTS.md)。不提交凭证、node_modules、构建产物和微信开发者工具私有配置。当前业务接口均为 GET/POST，不要求修改后端。

仓库许可证见 [LICENSE](LICENSE)，上游参考与直接依赖许可见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
