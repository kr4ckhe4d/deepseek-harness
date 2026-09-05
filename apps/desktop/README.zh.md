# apps/desktop — 桌面应用外壳

[English](README.md) | 中文

一个覆盖在 dsh web GUI 之上的 Electron 外壳，为 harness 提供 Claude-Desktop 风格的原生窗口。外壳不拥有任何 agent 行为：它以受支持的 `dsh web` profile 启动方式（`--no-open --port 0`）拉起后端，等待 `dsh web: <url>` 就绪行，然后把该已认证 URL 加载进单个 BrowserWindow。应用启动因此仍然经过 `dsh` profile launcher；外壳只是展示宿主，不是另一个 Node 应用入口。

## 运行

```sh
pnpm --filter @deepseek-ai/dsh-desktop run dev      # build main+preload, then launch Electron
pnpm --filter @deepseek-ai/dsh-desktop run smoke    # headless-style boot check: loads the GUI and exits 0
pnpm --filter @deepseek-ai/dsh-desktop run package  # build the self-contained macOS .app
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

<a id="packaging"></a>
## 打包

`npm run package` 产出 `release/mac-arm64/DeepSeek Harness.app`，它自带后端，无需安装 Node、也无需仓库检出即可运行。这由三步支撑。

**闭包。** `apps/desktop/runtime` 是一个纯依赖的 deploy root，列出 web profile 能到达的每个工作区包——沿依赖*与* peer 依赖传递闭合；harness 各包把 `@deepseek-ai/cordis` 及其插件声明为 peer，而 `pnpm deploy --prod` 不会代它们提供。用 `pnpm run gen-desktop-runtime-closure` 重新生成，不要手工编辑。

**暂存。** [`build/stage-backend.mjs`](build/stage-backend.mjs) 用 pnpm 的 hoisted linker 把该 root 部署到 `staged-backend/`，随后把每个逃出闭包的符号链接替换为真实副本并断言不再有残留——vendored Cordis 包是 `link:` override，pnpm 会把它们暂存为爬向仓库 `vendor/` 的相对符号链接。它随后恢复开发态安装，因为 `pnpm deploy --prod` 会把工作区标记为 production。

**放置。** [`build/after-pack.cjs`](build/after-pack.cjs) 把暂存好的闭包复制进 `Contents/Resources/backend`。electron-builder 的 `extraResources` 无法承载它：它只会带上清单，并静默丢弃其下的 `node_modules` 树。

运行时，已打包应用在 Electron 自带的 Node 下（`ELECTRON_RUN_AS_NODE`）运行该闭包的 launcher，使用 `userData` 下私有的 `DSH_HOME`，其中预置了 `patchReload` 为 `startup` 的 web profile。随附模板要求 `live`，那会让 launcher 挂载 `cordis-plugin-hmr`，而该服务需要 `--expose-internals`——在 Electron 的 Node 下不可用，且在没有重建 watcher 的构建里毫无意义。

## 有意的边界

该包为 `private: true`，不发布。该 `.app` 未签名，因此分发到另一台机器的副本会被 Gatekeeper 拒绝，直到用 Developer ID 完成签名与公证。代码签名、`dmg`/安装包目标、自动更新与 `dsh://` 深链路由记录为 [TODO.md](TODO.md) 中的延后工作。
