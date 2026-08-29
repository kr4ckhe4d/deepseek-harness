# Agent Note: 浏览器自动化技能及其运行时文件归属

Status: implemented

[English](2026-08-29-browser-automation-skill.md) | 中文

## 问题

DSH 会话没有内建的驱动真实网页浏览器的方式。一项站点任务——导航、点击穿透、填写表单、读取页面内容——每次工具调用都要各自启动一次 Playwright，而这样拿不住会话；动态 cordis-host-runner 沙箱甚至连截图都回不了。一套可用的栈——一个常驻守护进程、一个回环命令客户端、一个带 14 个工具的 `chrome-browser` 插件——原本住在 `tmp/dsh-browser/` 这个被 gitignore 的路径里，技能无法引用它；而让这套栈真正能跑起来的知识（为什么 image 块会让某一回合崩溃、为什么端口还在应答 `/health` 却什么都说明不了、为什么快照选择器必须唯一）只存在于调试过程里，没有沉淀下来。

## 决策

技能 `dsh-browser-automation` 位于 `.agents/skills/dsh-browser-automation/`，其运行时文件随技能一起提交在技能自身的 `scripts/` 目录中：`daemon.cjs`（常驻 Playwright 浏览器及其回环 HTTP 命令服务器）、`call.cjs`（一次性客户端，首次使用时拉起守护进程，并把 JSON 负载走 stdin 传入）、`plugin.host.js`（供 `cordis_define` 使用的 Host-only `chrome-browser` 插件源码）、`config.json`（`cdp` 开关，用于挂载到可视化 Chrome）、`verify.ts`（对照真实 `sandboxDefineTool` 守卫的渲染器检查）。

运行时保持为动态插件，而不做 `packages/` 下的包。Host-only 动态包在定义它的会话中激活，没有审批往返，与浏览器工作的作用域正好吻合：一个会话驱动一个浏览器，跑在某一台机器的 Chrome 上。包行（plugin row）则会为组合里挂载它的每个会话注册浏览器、把 Playwright 浏览器挂在宿主进程生命周期里，并且绕开沙箱设计刻意保留的 `shell.run` 逃生通道。

路径改为相对检出（checkout-relative），不再相对机器。守护进程从 `scripts/` 向上找到最近的 `.git` 定位仓库根，从 `apps/web/node_modules/playwright` 加载 Playwright（声明它的工作区包就是它）；运行时状态（浏览器配置、截图、日志）放在脚本旁边，由技能目录内的 `.gitignore` 挡在 git 之外，因此迁移过来的 Chrome 配置保留了登录态且绝不会入库。唯一的机器特定值是 `plugin.host.js` 里的 `CLIENT` 常量（`call.cjs` 的绝对路径），由定义插件的 agent 依据技能的基目录设置一次。

守卫改动随本工作一并交付：`packages/extensions/cordis-host-runner/src/guard.ts` 中的 `sandboxDefineTool` 在注册期拒绝沙箱渲染器产出的 `image`、`tool-call`、`tool-result` 块，因为 image 块携带的附件引用只有附件服务能签发，而 MCP 形状的替代品能通过注册、随后在 LLM 层才故障。单元测试在 `packages/extensions/cordis-host-runner/tests/sandbox.spec.ts`。

技能先给操作者路径——启动、指向可视化 Chrome、用 `browser_snapshot` 找选择器、恢复卡死的守护进程——之后才给沙箱约束的理由，供日后扩展插件的人阅读。它的示例只读页面、绝不改动站点状态，并对 `record-browser-gif` 技能做交叉引用而不是复述其录制与发布规则。

## 测试

`node --import tsx/esm .agents/skills/dsh-browser-automation/scripts/verify.ts` 通过真实守卫注册全部 14 个工具，并展示原有 image 块渲染器在注册期即被拒绝。`pnpm vitest run packages/extensions/cordis-host-runner` 覆盖守卫对不可签发块的拒绝。一次从完全停止状态出发的真实端到端运行——什么都没有跑、一次 `browser_navigate` 拉起浏览器、随后快照并读回文本——通过，`pnpm run test:docs` 通过文档门禁。

## 曾考虑的替代方案

- **`packages/` 下的包**——一个由组合挂载的一等插件行。拒绝：它会为挂载该组合的每个会话注册一组浏览器工具，把 Playwright 浏览器挂在宿主进程生命周期里而不是会话自有的子进程里，还绕开了设计刻意演示的沙箱逃生通道；浏览器的归属本来就是会话级的，而这正是动态插件所表达的东西。
- **把文件留在 `tmp/dsh-browser/`**——调试时的工作目录。拒绝：`tmp/` 被 gitignore，指向它的技能只在调试它的那台机器上可用。
- **`scripts/`**——直接拒绝：该目录保留给仓库门禁脚本，长期运行时文件会污染门禁面。
- **新建顶层目录**——没有先例：`native/` 放的是 vendored 原生辅助，`packages/` 是包层级，而 `record-browser-gif` 已经确立了技能自身目录就是其运行时脚本的所在，技能基目录即路径锚点。

## 后果

- 技能自包含：克隆仓库加 `pnpm install` 就是一台检出的全部所需；除 `CLIENT` 外所有路径都从技能基目录解析，而它每台机器只需设置一次。
- `scripts/chrome-profile/` 下的 Chrome 配置保存着专用 CDP 配置档的活跃登录态；技能目录内的 `.gitignore` 把它挡在 git 之外；技能明确说明无法挂载用户已登录的默认 Chrome，因为 Chrome 在默认 user-data-dir 下会忽略 `--remote-debugging-port`。
- 守卫的拒绝发生在注册期：沙箱渲染器若试图签发 image、tool-call 或 tool-result 块，会在作者还能处置的地方失败，教学式错误信息直接指出修法，而不是等它在 LLM 层里故障。
