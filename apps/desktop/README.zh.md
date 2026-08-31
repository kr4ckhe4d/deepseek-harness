# apps/desktop — 桌面应用外壳

[English](README.md) | 中文

一个覆盖在 dsh web GUI 之上的 Electron 外壳，为 harness 提供 Claude-Desktop 风格的原生窗口。外壳不拥有任何 agent 行为：它以受支持的 `dsh web` profile 启动方式（`--no-open --port 0`）拉起后端，等待 `dsh web: <url>` 就绪行，然后把该已认证 URL 加载进单个 BrowserWindow。应用启动因此仍然经过 `dsh` profile launcher；外壳只是展示宿主，不是另一个 Node 应用入口。

## 运行

```sh
pnpm --filter @deepseek-ai/dsh-desktop run dev    # build main+preload, then launch Electron
pnpm --filter @deepseek-ai/dsh-desktop run smoke  # headless-style boot check: loads the GUI and exits 0
```

环境变量：

| 变量 | 作用 |
|---|---|
| `DSH_DESKTOP_URL` | 附着到已运行的 `dsh web`，不再自行拉起。 |
| `DSH_DESKTOP_WORKSPACE` | 被拉起后端的工作区根目录（默认：用户主目录）。 |
| `DSH_DESKTOP_NODE` | 后端子进程使用的 Node 可执行文件（默认：PATH 上的 `node`）。 |
| `DSH_DESKTOP_SMOKE` | 为 `1` 时打印加载诊断，并在 GUI 加载完成后退出。 |

## 外壳提供什么

- 后端生命周期：通过源码启动向量（`node --import tsx/esm apps/cli/src/bin.ts web`）拉起，以 URL 行判定就绪，退出时 SIGTERM 后备 SIGKILL，子进程崩溃时展示带后端日志尾部与 Retry 的错误页。
- 窗口外观：macOS hidden-inset 标题栏加注入的拖拽条，窗口几何持久化并夹取到当前连接的显示器，后端启动期间显示加载页。
- 桌面集成：应用菜单（New Chat、缩放、devtools）、带 Show / New Chat / Quit 的托盘、全局 `Cmd/Ctrl+Shift+D` 显示/隐藏快捷键、单实例锁。
- 策略：导航固定在后端 origin（其余链接交给系统浏览器打开），且仅后端 origin 可使用通知、剪贴板与全屏。

纯逻辑部分（就绪行解析、窗口几何规范化与夹取）位于 `src/url-line.ts` 与 `src/window-state.ts`，由根 vitest 套件（`apps/desktop/tests`）覆盖。

## 有意的边界

该包为 `private: true`，不发布。安装包打包、代码签名、自动更新与 `dsh://` 深链路由记录为 [TODO.md](TODO.md) 中的延后工作。
