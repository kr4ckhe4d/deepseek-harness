# Agent Note：空白会话 hero 上的聊天与代码模式

Status: implemented

[English](2026-08-31-chat-and-code-session-modes.md) | 中文

## 问题

Web GUI 中每个 Session 都记账到某个 Workspace，空白会话 hero 在用户选定文件夹之前拒绝输入。这对写代码是对的，对随口一问则是错的：桌面风格主页（[桌面风格主页体验](2026-08-31-desktop-style-home-experience.zh.md)）打开后仍是「选择工作区」，于是产品只有代码表面，没有聊天表面。

## 决定

hero 在既有 Workspace 机制之上获得「聊天 / 代码」模式切换；不新增 Session 种类，也不新增第二个 composer。

**chat home。** `ctx.uiWorkspace` 新增 `chatHomePath()` 与 `connectChatHome()`。chat home 就是 ready 帧的 `RemoteHostFacts.home` 所报告的 Host 主目录，首次使用时注册为一个普通 Workspace。因此聊天模式不做任何 provisioning：本处无法创建目录（组合的 `directoryPicker` 提供的是 `native` capability，其 seam 没有 `createDirectory`，只有 `browse` capability 才有），而主目录是唯一保证存在的路径。注册按规范化路径幂等，因此与已存储写法不同的 `home` 拼写会解析到同一个 Workspace 而不是新增一行；已注册的主目录保留自己的标题——聊天绝不重命名用户拥有的 Workspace。

**模式是推导出来的，不是存储的。** `chatActive` 将 Session 的有效 Workspace 路径与 chat home 比较，并用一个 pending 标志桥接「点击到连接完成」的窗口。不存在会与 Session 实际 cwd 漂移的持久「模式」字段，重新打开一个聊天 Session 会自行落在聊天模式。

**呈现。** 聊天模式隐藏 Workspace 标签与 `conversation.hero.dashboard` 座位（聊天没有可汇报的项目），并替换 composer 占位文案。由于标签承载着 Workspace 选择器的 anchor ref，聊天激活时该 ref 交给「代码」按钮，因此选择「代码」会从用户真正点击的控件弹出选择器。

`selectWorkspace` 与 `startChat` 现在共用同一段 `openConnected` 尾巴，因此半写好的草稿及其图片会像跟随 Workspace 切换一样跟随模式切换。

## 曾考虑的替代方案

**provision 专用的 `~/Chats` 目录。** 先实现后回退：本部署组合的 native picker 拒绝 `directoryPicker.createDirectory`，因此目录从未被创建，Workspace 注册随之失败。要让它成立需要新的宿主端 provisioning 动词；本轮记为延后工作，而不是为此扩大 wire。

**以「Chats」标题注册主目录 Workspace。** 否决：`workspace.create` 是幂等的，已经注册过主目录的用户会被悄悄改掉标题。

**逐 Session 的持久模式字段。** 否决：它会复制 Session cwd 已经承载的事实，并可能与之不一致。

## 验证

四个 service 测试覆盖首次注册、复用已注册的主目录、以及 ready 之前的拒绝；五个组件测试覆盖推导出的模式、隐藏的标签与仪表盘、连接调用、聊天已生效时的惰性、以及 Host 主目录未知时的禁用状态。已对 `dsh web` 实机验证：聊天无文件夹提示即可开始 Session，代码重新打开选择器，两个方向都恢复各自的界面元素。
