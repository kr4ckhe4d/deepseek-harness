# Agent Note：覆盖 dsh web GUI 的桌面 Electron 外壳

Status: implemented

[English](2026-08-31-desktop-electron-shell.md) | 中文

## 问题

harness 已有浏览器与终端表面，但没有原生桌面应用。桌面外壳不能成为第二个应用启动器：启动规则规定 `dsh` profile 是唯一受支持的 Node 应用入口，而 web GUI 已承载完整的产品表面（会话、工具、审批、设置）。

## 决定

`apps/desktop`（`@deepseek-ai/dsh-desktop`，private）是覆盖既有 web profile 的 Electron 展示宿主。它拉起 `node --import tsx/esm apps/cli/src/bin.ts web --no-open --port 0`，以 `dsh web: <url>` 行为就绪信号，把该已认证 URL 加载进单个 BrowserWindow。外壳只拥有桌面事务：夹取到在线显示器的窗口几何持久化、加载页与带后端日志尾部及 Retry 的错误页、应用菜单、托盘、全局显示/隐藏快捷键、单实例锁、固定在后端 origin 的导航（外部链接交给系统浏览器）、以及仅限后端 origin 的权限授予（通知、剪贴板、全屏）。

两个启动事实决定了拉起方式：子进程必须使用真实 Node 可执行文件，因为 Electron-as-Node 破坏了 web profile 的 HMR 行所需的 loader 内部机制；子进程环境将 `TSX_TSCONFIG_PATH` 固定到仓库 `tsconfig.base.json`，因为 tsx 从子进程 cwd 发现 tsconfig——cwd 是用户工作区根目录而非仓库——缺少 paths 映射时工作区导入会回退到可能过期的已构建 `lib/`。

纯逻辑部分（`src/url-line.ts`、`src/window-state.ts`）经由既有 `apps/*/tests` glob 在根测试套件中做单元测试；`DSH_DESKTOP_SMOKE=1` 提供自终止的启动自检：加载 GUI 后以 0 退出。Electron 的二进制下载已在 `pnpm-workspace.yaml` 的 `allowBuilds` 中列白。

## 曾考虑的替代方案

**在 Electron 主进程内组合内联插件树。** 否决：这会造出第二个应用启动器并复制 web profile 的装配；启动规则正是为阻止这种情况而存在。

**复用 Electron 二进制作为后端 Node（`ELECTRON_RUN_AS_NODE`）。** 实测后否决：profile 能启动并打印 URL，但 HMR 行崩溃，因为在 Electron 打补丁的模块系统下 loader 的模块内部机制不可用。

## 延后

安装包打包、代码签名、自动更新与 `dsh://` 深链路由记录于 `apps/desktop/TODO.md`。
