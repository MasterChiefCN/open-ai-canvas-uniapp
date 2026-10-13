# 后端合同与兼容记录

当前源码适配基线：`ddcat-ai/open-ai-canvas@4c1d2b4012cfeeb301fdcdd2949e782ea5aca351`，其 VERSION 为 `v1.6.6`。本次从首版基线 `9868f5e8` 对照升级，已读取 handler、业务实现及 Web 调用方。尚未执行真实服务端接口或微信/App 联调，“运行验证版本”暂为空。

## 源码依据

以下均位于 [当前上游源码](https://github.com/ddcat-ai/open-ai-canvas/tree/4c1d2b4012cfeeb301fdcdd2949e782ea5aca351)。

| 合同                           | 文件                                                                                                                                             |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 账号、会话、验证策略、协议     | `web/src/services/api/auth.ts`、`web/src/services/api/verification.ts`、`backend/internal/auth/auth.go`、`backend/internal/auth/verification.go` |
| 业务信封                       | `web/src/services/api/request.ts`                                                                                                                |
| 系统目录、默认规格、available  | `backend/internal/app/model_catalog.go`、`backend/internal/app/logical_models.go`、`backend/internal/handler/model_catalog.go`                   |
| 渠道模型能力                   | `web/src/lib/model-capabilities.ts`                                                                                                              |
| 生成、资源引用、批次、配置类型 | `web/src/services/api/generation-task.ts`、`backend/internal/app/provider.go`、`backend/internal/app/task_creation.go`                           |
| 视频 operation、输入计数       | `web/src/lib/model-selection.ts`                                                                                                                 |
| 任务、sequence、安全日志       | `web/src/services/api/task-center.ts`                                                                                                            |
| 上传与资源访问变体             | `web/src/services/api/resources.ts`、`backend/internal/handler/user_data.go`、`backend/internal/assets/access.go`                                |
| 原任务作品保存恢复             | `backend/internal/app/task_media_recovery.go`、`backend/internal/app/task_lifecycle.go`、`backend/internal/handler/routes.go`                    |
| 单条素材入库、资源元数据       | `web/src/services/api/user-data.ts`、`backend/internal/handler/user_data.go`                                                                     |
| 素材数据格式、生成 ID          | `web/src/lib/asset-record.ts`、`web/src/stores/use-asset-store.ts`、`web/src/services/generation-task-materializer.ts`                           |
| 钱包、兑换、分页               | `web/src/services/api/wallet.ts`、`backend/internal/handler/finance.go`                                                                          |

## 方案核对结果

- 钱包分页采用 Web 调用方的 `page`、`pageSize` 和 `type`，而不是方案示例的 `limit`。
- 新版目录固定为 `source=system`，模型集合位于 `channels[].models`，`models` 固定为空；不受 frontendModelsEnabled 开关控制。渠道名称已脱敏，使用模型 displayName/modelKey，不依赖渠道 name。优先采用目录 defaultOptions，避免默认时长/分辨率没有价格档。客户端既有逻辑模型映射保留用于历史数据合同，当前适配验收以系统目录为准。
- 执行 config 中的 count、videoSeconds、transparentBackground、videoGenerateAudio、videoWatermark 为字符串；能力过滤 options 保留数字和布尔类型。提交前重新查询 available，并用最新返回的模型能力校验。
- `/tasks` 的 data 是数组，不是 `{ tasks: [] }`。使用 `pageSize=100`，另查 `activeOnly=true` 后去重。
- 文本/图片 operation 为 `text`/`image`，视频按参考图选择 `text_to_video`/`image_to_video`。资源引用为 `storageKey: resource:<id>`，不发送临时路径。
- 文本增量使用 `deltas[].sequence/content`、`textDraft`、`finalText`。游标 0 恢复不先拼接旧快照，避免重复。
- 日志的 message/payload 可能含技术信息，仿照 Web 只投影白名单阶段，不直接展示原始日志。

## 新版账号合同

`/auth/settings` 下发 smsLogin、emailLogin、smsRegistration、emailRegistration、smsAndEmailRegistration 及服务协议标题和正文。密码登录继续使用 `{ username, password }`。普通注册从可用验证方式中选择；双重验证启用时只能选 sms_email；没有可用验证方式时停止普通注册并显示管理员配置提示。

验证码登录/注册先调用 `POST /auth/verification`，传 purpose、method、对应的 email/phone；保存返回的 ticket、expiresIn 和 retryAfter。双重验证一次请求发送两种验证码，分别填写 emailCode 和 smsCode。联系方式或验证方式改变后清理本次 ticket 和验证码；未使用的联系方式提交空值，避免与服务端 ticket 归属不一致。ticket 与验证码只保存在内存；发送超时仍开始倒计时，不自动重发。

注册提交 acceptedTerms，默认未勾选，由用户阅读并明确同意后提交。服务协议标题/正文取自后端；没有正文时提示管理员尚未配置。首个账号免验证码但仍需同意协议。找回密码继续使用 `/auth/password-reset-code` 和 `/auth/password-reset`，不替换为登录验证接口。

## 网络与会话

统一构造 URL，统一处理 `{ code, data, msg, reason }`。HTTP 成功而 code 非零仍为失败；session 的 user=null 清空会话。

Cookie 只从 API 响应读取，发送时只带名称和值，处理 Max-Age 优先级、Expires、多 Cookie 与删除。上传复用同一会话，媒体下载与组件不附带手工 Cookie。

短期媒体地址使用 `POST /resources/access`，请求数组中的每项包含 resourceId、purpose 和 variant。HTTP/业务信封成功后仍逐项检查 error，并核对 resourceId，不能把批次 code=0 当作每项成功。已移除对 `/resources/:id/oss-url` 的调用。

视频预览请求 display/playback，图片缩略图请求 display/thumbnail，读取尺寸请求 browser-process/original，相册保存请求 download/original。将根相对签名地址解析到统一 API 域名；访问描述符仅在内存使用，详情按 refreshAt 刷新，后台暂停、返回前台刷新，媒体加载失败最多自动刷新一次。playback 未就绪时后端可回落原件；真实编码、转码和下载仍需真机验收。

账号清理递增请求 epoch 并 abort；旧响应在读取 Cookie/业务结果前被丢弃。缓存按完整 API 根地址和账号隔离。退出网络失败仍清理本地，但提示服务器注销未确认。

GET 由页面刷新或共享轮询再次查询；写操作没有通用自动重试。图片批次逐项提交，失败后停止后续项并报告已接收数量。超时可能已经创建任务，需要先核对列表。

## 适配范围

参数面板支持目录声明的枚举/数值范围：size、quality、videoSeconds、vquality、count，以及明确支持的透明背景、视频音频和水印开关。优先使用服务端默认选项；图片显式尺寸预设带档位/比例标签，只有允许自定义时才加入声明的预设与默认尺寸；仅含通配符的尺寸配置沿用后端标准选项，不提供自由输入。切模型重设合法默认值，范围最多展开 100 个值，不开放供应商高级参数。文本是否请求上游流式输出遵循能力配置 streaming；客户端仍用 text-deltas 回放。

文本使用本地当前会话，无多对话目录。新版 result.text 可能为字符串、嵌套文本对象或数组，按 Web 合同归一化；结构化 JSON 内容保留为 JSON 文本，预览与入库共用解析逻辑。媒体详情支持预览、刷新签名和保存。成功任务通过 `GET /assets/:id`、`PUT /assets/:id` 单条同步个人素材库；文本使用 `data.content`，图片使用 `data.dataUrl`，视频使用 `data.url`。图片和视频必须带有效尺寸、字节数和具体 MIME，尺寸缺失时读取媒体信息，不伪造尺寸。

素材 ID 与 Web 生成逻辑一致：`generation_` 加 `SHA256(materialize:taskId:outputIndex)`。已存在则不写回；失败重试先读再写，部分成功不会重复新建。持久地址采用当前 API 根下的 `/resources/:id/file` 和 `resource:<id>`，不把短期签名作为素材永久地址。旧结果只有外部 URL 时使用 `/resources/import`，请求携带固定 `X-Idempotency-Key`。任务列表的摘要没有完整 `inputJson/resultJson`（见 `backend/internal/app/task_output.go`），同步前读取详情并核对 `metadata.source=uniapp-wechat/uniapp-app` 或本机任务记录；列表图片预览可读取 previewUrl/previewKind，后端稳定资源地址须先换取访问描述符。

同步在小程序运行时执行；关闭期间完成的任务，在重新进入页面加载后补同步。同步失败与生成失败独立展示，429 遵循 Retry-After；不对其他业务写入增加通用重试。只有本地缓存保存成功记录，清缓存后无法区分“从未入库”与“已彻底删除”，此时可能恢复该任务素材。各供应商视频参数、首尾帧语义和媒体格式仍需按实际部署模型联调。

任务 canRecoverMedia 为真且失败时提供“重试保存作品”，调用 `POST /tasks/:id/recover-media` 并继续轮询原任务；不调用 /retry、不重建生成任务。界面分别显示 mediaStage、生成状态与素材同步状态。恢复间隔、次数、退款订单和费用核对由后端校验。普通重试只向首版支持任务开放，并阻止保存恢复任务、上游取消确认中、账务 uncertain、Agent 和创作审批任务；普通重试依旧可能产生新的生成计费。

钱包余额、microcredits、兑换与流水分页合同经源码核对保持一致。升级后端须回归账号、系统目录、上传、三类生成、恢复和积分。字段变化集中调整 API/适配器，不能承诺不同协议仅需更换 URL。
