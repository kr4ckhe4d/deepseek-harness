# Agent Note：Web GUI 中的桌面风格主页体验

Status: implemented

[English](2026-08-31-desktop-style-home-experience.md) | 中文

## 问题

Electron 外壳落地后（[桌面 Electron 外壳](2026-08-31-desktop-electron-shell.zh.md)），harness 窗口打开时仍是一个没有个性的空白会话 hero，而 fork 已经聚合的用量统计只能通过设置弹窗到达。桌面产品的主页应当展示你是谁、你最近做了什么、账户控件在哪里——并且不引入第二套 UI 栈。

## 决定

桌面风格主页由四个既有客户端包承担；没有新包，也没有新的 roster 行。

- **ui-settings-general** 拥有持久化的 `ui-profile` 命名空间（fullName、nickname；默认均为 `''`），由其 node 半侧注册；通用页上两行失焦提交的 Profile 字段编辑它（未提交的草稿在组件卸载时同样提交，关闭对话框不会丢掉刚输入的名字）；侧边栏底部的设置触发器改为账户行——首字母头像加显示名——点击先弹出菜单（设置、语言、获取帮助）再进入面板。
- **ui-conversation** 声明新的单占用根 slot `conversation.hero.dashboard`，渲染在 hero composer 之下；并个性化 hero 标题：有称呼时展示按本地时段与日期奇偶从八条字典模板中选取的衬线问候语（`greetingKeyFor`），否则保持原标题与 preview 徽章。它通过自己的 `settingsScope.bind` 以线上已知的 `ui-profile` 命名空间读取资料，并做防御性 decode——客户端 bundle 纯净门禁禁止跨插件值导入，因此共享的是命名空间名这一事实，而不是共享常量。
- **ui-settings-usage** 用其既有概览/模型两个页签的紧凑卡片填充 hero 座位，并复用与设置分区相同的 `UsageStore` 实例，两个表面因此始终一致；卡片在出错或语料库还没有会话时保持安静。
- **ui-sidebar** 在展开态 New Session 栏上加入按平台区分的快捷键提示，并挂接 document 级 Cmd/Ctrl+N 绑定（在桌面外壳中生效；多数浏览器保留该组合键）。

## 曾考虑的替代方案

**独立的主页/仪表盘客户端包。** 本轮否决：每一部分都扩展既有包已拥有的表面（它的设置页、它的 hero、它的触发器），新包只会增加 roster 接线与 invariant/覆盖率表面，却没有新的所有权。

**通过值导入共享 profile 常量。** 否决：客户端 bundle 纯净门禁禁止跨插件值导入；会话侧按线上名字绑定命名空间并自带 decode。

## 验证

既有行为测试随其描述的行为一起更新（触发器现在先打开账户菜单；外壳自己在通用页落座一项；侧边栏快照带上提示）。新增单元测试覆盖 `greetingKeyFor` 的时段/奇偶选择与 profile 辅助函数。已对 `dsh web` 实机验证：带称呼的问候语、两个页签的仪表盘卡片、账户菜单流程、以及资料跨重启持久化。
