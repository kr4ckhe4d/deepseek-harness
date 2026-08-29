# Agent Note: 模型用量统计设置页

Status: implemented

[English](2026-08-29-model-usage-statistics-settings.md) | 中文

## 问题

会话日志已经记录了用量面板所需的全部信息——每条 `assistant/message` 事件都带有该步骤的模型 ID（`message.source.model`）与提供方上报的 token 记账（`usage`），`user/message` 事件提供消息计数——但没有任何界面把它呈现出来。用户无法看到自己运行了多少会话、消息与 token，最常用的模型是什么，或者活动如何按天与按小时分布，除非去阅读 `session.log` 文件。

构建该界面需要决定聚合在哪里执行，以及依赖时区的分桶（本地日期、本地小时、周分桶、连续天数）如何计算，因为客户端的时钟与 Host 的时钟并不相同。

## 决策

一个新的只读设置页"模型用量"（`@deepseek-ai/dsh-client-ui-settings-usage`）注册到 `settings.section` 上，包含两个页签——概览与模型——以及同时作用于两者的全部 / 30 天 / 7 天范围筛选。概览页签渲染八张统计卡片（会话数、消息数、总 token 数、活跃天数、当前连续与最长连续、高峰时段、常用模型）与一张 GitHub 风格的每日 token 用量日历热力图；模型页签渲染按模型拆分的每周堆叠柱状图，以及包含每个模型输入/输出总量与占比的图例表格，默认展示前六名并提供"展开其余 N 个"按钮。模型 ID 直接取自请求日志，绝不用硬编码列表。

Host 始终是唯一的事实来源，与设置界面的其他页面一致：`SessionController` 新增 `session.usage` Remote 方法，由 `SessionUsageController`（`packages/api/session-controller/src/usage.ts`）实现。它列出每个可见会话（存在 `cwd`，即会话列表自身的可见性规则），把每个日志折叠为表面消息（用户与助手消息，外加每次请求的模型与计费 token），并按客户端提供的 IANA 时区聚合（复用 prompt RPC 的 `clientTimeZone` 模式）。所有分桶——本地日连续天数、高峰时段、热力图日序列、周日起始的周分桶——都在 Host 端用 `Intl.DateTimeFormat` 按请求的时区计算，因此客户端不需要在网络上发送原始事件，也不需要做任何日历运算。

聚合按需执行，对冷持久会话读取做有界并发（逐会话容错与 Session 列表的冷摘要策略一致：某个会话不可读时跳过而不是让整体失败），无持久缓存——设置页很少打开，推送的 `api-session/activity` 失效通知会刷新已打开的页面。`usage` 结果是有界的：日序列横跨范围窗口（`all` 为 364 天），周图表横跨同一窗口，按模型的行预先聚合，因此无论语料多大，载荷都很小。

## 客户端 store 契约

设置页的页面 store（`UsageStore`）携带浏览器解析出的 IANA 时区调用 `session.usage({ range, timeZone })`，并把范围作为重新拉取的键；代际计数器为过期响应设置围栏。组件与模型设置页一样，通过 slot 的 inject 面（`controller`、`hooks.snapshot`、`api`、`t`）接收 store，在注入之前不渲染任何内容，并且不声明扩展位——该设置页是只读的。

## 数据语义

- **消息数**统计范围内每个 `user/message` 与 `assistant/message` 表面事件。
- **Token** 为计费总量（未缓存输入 + 缓存读取 + 缓存写入 + 输出），来自 `assistant/message.usage`，仅当适配器上报用量时才存在；不报告用量的适配器仍贡献消息与活跃度，但 token 为零。
- **连续天数**与**活跃天数**基于所选范围内的本地日分桶，因此 30 天 / 7 天窗口会把连续天数截断到窗口起点。
- **常用模型**是范围内 token 最多的模型（没有则为 `null`）。
- **高峰时段**是消息最多的本地小时；并列时取最早的小时。

## 曾考虑的替代方案

- **客户端聚合**——把每个会话的完整日志分页拉进浏览器再折叠。已否决：它会把原始事件日志（含 chunk 行）经网络发送，重复 Host 的读取机制，而且仍然需要 Host 提供语料列表；Host 端聚合只返回一个小 JSON 视图。
- **每会话投影单元**（`session-stats` 的先例）持久化到投影缓存。已否决：日/小时/周分桶依赖客户端的时区，持久化投影无法知道它；跨语料的聚合仍然需要扫描每个会话；按需折叠把代码放在一处，而设置页打开频率太低，不值得维护缓存失效。
- **为折叠单独建一个 Host 包**——已否决，属于过度拆分；`session-controller` 已经拥有 Session Remote 的冷读取（`list`、`history`），折叠只是其中的一个纯模块，并有单元测试覆盖。

## 后果

- **打开页面会扫描语料**：首次打开用量页会折叠一次每个可见会话日志；非常大的语料会更慢，视图的新鲜度只到最近一次拉取或推送的失效通知为止。
- **时区分桶跟随拉取时刻**：跨时区变更仍保持打开的页面会保留之前拉取的分桶，直到下一次切换范围或收到失效通知。
- **没有用量记账的适配器会少计 token 总量**——已记录在 README 的 Known Limitations 中。
- **Remote 边界强制使用 JSON 安全的 null**：`favoriteModel` 是 `string | null` 而不是 `string | undefined`，因为 Typert 在 Remote 边界拒绝 `undefined`。
