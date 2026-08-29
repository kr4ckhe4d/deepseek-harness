---
description: "dsh web 客户端的模型用量设置页：概览卡片、日历热力图、按模型的每周 token 图表，以及基于会话日志的每个模型的输入/输出 token 统计。"
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-usage

[English](README.md) | 中文

## 概述

`dsh-client-ui-settings-usage` 是 dsh web 客户端的模型用量设置页：它读取 Host 聚合的、覆盖每个可见会话日志的用量视图，展示你使用模型的情况。概览页签渲染八张统计卡片——会话数、消息数、总 token 数、活跃天数、当前连续与最长连续、高峰时段、常用模型——以及一张 GitHub 风格的每日 token 用量日历热力图。模型页签渲染按模型拆分的每周堆叠柱状图，以及包含每个模型输入/输出 token 总量与用量占比的图例表格。时间范围筛选（全部 / 30 天 / 7 天）同时作用于两个页签，所有数据都按你浏览器的时区分桶。

## 目录

- [使用本包](#use-this-package)
- [理解实现](#understand-the-implementation)
- [进一步探索](#further-exploration)
- [模型体验](#model-experience)
- [已知限制与延期工作](#known-limitations-and-deferred-work)
- [开发备注](#dev-note)

-----

<a id="use-this-package"></a>
## 使用本包

从设置导航中打开用量页。选择范围筛选，即可把所有数字收窄到最近 7 天、最近 30 天或全部历史，然后在两个页签之间切换。

### 概览

八张卡片汇总所选范围：会话与消息总数、总 token 数（计费输入加缓存加输出，紧凑格式化）、不同的活跃天数、截至今天的当前连续天数（今天无活跃则为 0）、最长连续活跃天数、消息最多的本地时段，以及 token 最多的模型。卡片下方，日历热力图按窗口内最大值，用四个色阶加上无活跃的空格为每个本地日期着色——包含星期行、月份标签以及 Less/More 图例。

### 模型

堆叠柱状图按模型拆分展示每周的 token 用量，自动缩放并带紧凑坐标轴。下方的图例表格列出范围内出现的每个模型，按 token 占比降序排列，包含颜色色块、请求记录中记录的模型 ID 原文、输入与输出 token 总量，以及占范围内总量的百分比。当模型超过六个时，表格展示前六个并提供"展开其余 N 个"的展开按钮。

-----

<a id="understand-the-implementation"></a>
## 理解实现

<details>
<summary>Implementation internals — click to expand</summary>

该设置页是只读的：它不声明扩展位，也不写入任何内容。它的页面 store 携带所选范围和浏览器解析出的 IANA 时区调用 Host 的 `session.usage` Remote 方法，然后渲染返回的视图；切换范围会重新拉取，推送的会话活动失效通知会在不轮询的情况下刷新已打开的页面。

Host 始终是唯一的事实来源。它列出每个可见会话，把每个日志折叠为表面消息（用户与助手消息，外加 `assistant/message` 事件已经携带的每次请求的模型 ID 和 token 记账），并按请求的时区聚合：为热力图和连续天数计算本地日分桶，为高峰时段计算本地小时计数，为每个模型计算总量，以及为模型图表计算周日起始的周分桶。聚合按需执行，对冷持久会话读取做有界并发，某个会话不可读时跳过它而不是让整个读取失败。

### 文案与本地化

所有文案在 `settings.usage` 字典命名空间下提供中英双语；紧凑 token 后缀与数字分组复用共享的 locale 词汇，因此格式化保持 locale 归属性。

</details>

-----

<a id="further-exploration"></a>
## 进一步探索

- [ui-settings-models](../ui-settings-models/README.zh.md) — 模型设置页，配置本页所报告用量的提供方。
- [ui-settings-general](../ui-settings-general/README.zh.md) — 本设置页注册进其中的设置外壳。
- [api-session-controller](../../api/session-controller/README.zh.md) — Host 端 Session Remote 的属主，包括 `session.usage` 聚合。

-----

<a id="model-experience"></a>
## 模型体验

### 记录的请求用量

#### What the model sees

没有新增内容：本页只渲染已有的日志事件，不添加任何 prompt、工具 schema 或系统内容；它通过 Host 的 `session.usage` 聚合读取持久化的会话日志。

#### Token effect

不会产生新 token：本页只渲染已记录的用量数字，它读取的 Host 聚合也不执行任何模型调用。

#### KV Cache effect

无直接影响；本包不读写 KV 缓存。

## 已知限制与延期工作

<a id="known-limitations-and-deferred-work"></a>

以下限制定义了统计的新鲜度与覆盖范围；它们是本包的当前约束。

- **Token 总量只统计报告用量的步骤**——不报告用量的适配器仍贡献消息与活跃度，但其步骤计入的 token 为零。
- **聚合是按需执行的**——打开用量页会折叠一次每个可见会话日志；非常大的语料会让首次打开变慢，视图的新鲜度只到最近一次拉取为止。
- **分桶跟随拉取时的时区**——跨时区变更仍保持打开的页面会保留之前拉取的分桶，直到下一次切换范围或收到失效通知。

<a id="dev-note"></a>
### 开发备注

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
