# 后端合同与兼容记录

静态分析基线：`ddcat-ai/open-ai-canvas@9868f5e8`。已读取真实源码；尚未执行服务端接口或微信联调，“运行验证版本”暂为空。

## 源码依据

以下均位于 [上游基线源码](https://github.com/ddcat-ai/open-ai-canvas/tree/9868f5e8)。

| 合同                     | 文件                                                                                  |
| ------------------------ | ------------------------------------------------------------------------------------- |
| 账号、会话、功能开关     | `web/src/services/api/auth.ts`、`backend/internal/handler/auth.go`                    |
| 业务信封                 | `web/src/services/api/request.ts`                                                     |
| 目录两种形式与 available | `web/src/services/api/logical-models.ts`、`backend/internal/handler/model_catalog.go` |
| 渠道模型能力             | `web/src/lib/model-capabilities.ts`                                                   |
| 生成、资源引用、批次     | `web/src/services/api/generation-task.ts`                                             |
| 视频 operation、输入计数 | `web/src/lib/model-selection.ts`                                                      |
| 任务、sequence、安全日志 | `web/src/services/api/task-center.ts`                                                 |
| 上传与资源签名           | `web/src/services/api/resources.ts`                                                   |
| 钱包、兑换、分页         | `web/src/services/api/wallet.ts`、`backend/internal/handler/finance.go`               |

## 方案核对结果

- 钱包分页采用 Web 调用方的 `page`、`pageSize` 和 `type`，而不是方案示例的 `limit`。
- 目录可以返回 `source=frontend` 的 `models`，或 `source=system` 的 `channels`。前者发送 `logicalModelId`，后者发送系统 `channelId`、协议和能力；不创建自定义渠道。
- `/tasks` 的 data 是数组，不是 `{ tasks: [] }`。使用 `pageSize=100`，另查 `activeOnly=true` 后去重。
- 文本/图片 operation 为 `text`/`image`，视频按参考图选择 `text_to_video`/`image_to_video`。资源引用为 `storageKey: resource:<id>`，不发送临时路径。
- 文本增量使用 `deltas[].sequence/content`、`textDraft`、`finalText`。游标 0 恢复不先拼接旧快照，避免重复。
- 日志的 message/payload 可能含技术信息，仿照 Web 只投影白名单阶段，不直接展示原始日志。

## 网络与会话

统一构造 URL，统一处理 `{ code, data, msg, reason }`。HTTP 成功而 code 非零仍为失败；session 的 user=null 清空会话。

Cookie 只从 API 响应读取，发送时只带名称和值，处理 Max-Age 优先级、Expires、多 Cookie 与删除。上传复用同一会话，媒体下载与组件不附带手工 Cookie。

账号清理递增请求 epoch 并 abort；旧响应在读取 Cookie/业务结果前被丢弃。缓存按完整 API 根地址和账号隔离。退出网络失败仍清理本地，但提示服务器注销未确认。

GET 由页面刷新或共享轮询再次查询；写操作没有通用自动重试。图片批次逐项提交，失败后停止后续项并报告已接收数量。超时可能已经创建任务，需要先核对列表。

## 适配范围

参数面板支持目录声明的枚举/数值范围：size、quality、videoSeconds、vquality、count。切模型重设合法默认值，提交时重新校验 availability 和 capabilityProfiles 组合。范围最多展开 100 个值，不开放供应商高级参数。

文本使用本地当前会话，无多对话目录。媒体详情支持预览、刷新签名和保存，尚未关联 Web 素材库。各供应商视频参数、首尾帧语义和媒体格式需按实际部署模型联调。

升级后端须回归账号、两种目录、上传、三类生成、恢复和积分。字段变化集中调整 API/适配器，不能承诺不同协议仅需更换 URL。
