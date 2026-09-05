# Agent Note：自包含的桌面应用打包

Status: implemented

[English](2026-09-05-self-contained-desktop-package.md) | 中文

## 问题

[桌面 Electron 外壳](2026-08-31-desktop-electron-shell.zh.md)从仓库检出目录、在系统 Node 下拉起 `dsh web`。这对开发是对的，对 `.app` 则毫无用处：移动到 `/Applications` 后，外壳会解析一个已不存在的仓库路径，而且它要求一个 harness 无法假定存在的 Node 安装。给外壳打包是简单的；决定已打包应用把什么当作后端来运行，才是全部问题。

## 决定

已打包应用自带后端，并用 Electron 自己的 Node 运行它，因此既不需要检出目录，也不需要 Node 安装。

**由 Electron 承载后端。** 外壳原本拉起系统 Node，是因为 web profile 的 HMR 服务要求 `--expose-internals`，而 Electron 的 Node 不暴露它。该服务之所以被挂载，只是因为随附的 profile 模板声明了 `patchReload: live`（[`profile-boot.ts`](../../../../apps/cli/src/profile-boot.ts) 会为 live profile 创建 `cordis-plugin-hmr`）。已打包应用没有重建 watcher，因此它在 `userData` 下预置一个私有 `DSH_HOME`，其中的 web profile 为 `patchReload: startup`，并以 `ELECTRON_RUN_AS_NODE` 运行 launcher。开发态载体保持不变。

**闭包是生成的，不是人工挑选的。** `apps/desktop/runtime` 是一个纯依赖的 deploy root，由 `scripts/gen-desktop-runtime-closure.ts` 写出：它从 launcher 与 web profile 命名的两个 bundle 出发遍历工作区，同时沿依赖*与* peer 依赖前进。peer 这条边是关键：harness 各包把 `@deepseek-ai/cordis` 及其插件声明为 peer，而 `pnpm deploy --prod` 不会代依赖方提供 peer，因此人工挑选的 root 会在启动时一次缺一个包地失败。`python/sdk-runtime` 的单可执行文件闭包无法复用——它不含任何 web 包。

**暂存让闭包自包含。** `build/stage-backend.mjs` 用 pnpm 的 hoisted linker 部署，随后把每个解析到闭包之外的符号链接替换为真实副本，并断言不再有残留。vendored Cordis 包是 `link:` override，pnpm 把它们暂存为爬向仓库 `vendor/` 的相对符号链接；它们在检出目录内可以解析，一旦应用被复制到别处就会悬空——而这恰恰是仓库内测试覆盖不到的情形。被替换包自身的 `node_modules` 会被丢弃，因为闭包是 hoisted 的，复制检出目录的开发树只会把无关包一起拖进来。该步骤还会恢复开发态安装，因为 `pnpm deploy --prod` 会把工作区标记为 production，之后每条 pnpm 命令都会拒绝运行。

**放置是 after-pack 步骤。** electron-builder 的 `extraResources` 只带上闭包的清单，并静默丢弃其下的 `node_modules` 树——加不加显式 `filter` 都一样。`build/after-pack.cjs` 在应用目录生成后把暂存树复制进 `Contents/Resources/backend`，位于 asar 归档之外，因为 launcher 从真实文件系统解析同级包。

## 曾考虑的替代方案

**复用单可执行文件构建。** 否决：`python/sdk-runtime` 的闭包面向 SDK 与 ACP，既不含 `@deepseek-ai/dsh-web-app`，也不含 web 前端。

**要求已安装 Node 或 `dsh`。** 对可分发应用否决；开发态仍可通过 `DSH_DESKTOP_NODE` 使用。

**把仓库塞进应用。** 否决：那会携带 2.1 GB 的开发树，而且仍然需要 tsx 与系统 Node。

## 验证

把 `.app` 复制到仓库之外并在那里运行：后端就绪、窗口加载 GUI、退出时没有被遗弃的后端进程。最后一项检查也顺带修掉了本外壳自身在 8 月 31 日引入的缺陷——smoke 模式调用了 `app.exit`，它会跳过 `before-quit`，导致每次运行都泄漏一个后端。

## 延后

该 `.app` 未签名，因此在另一台机器上的副本会被 Gatekeeper 拒绝，直到用 Developer ID 完成签名与公证。安装包目标、其他架构与自动更新记录在 `apps/desktop/TODO.md`。
