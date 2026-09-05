# apps/desktop — desktop application shell

English | [中文](README.zh.md)

An Electron shell over the dsh web GUI, giving the harness a Claude-Desktop-style native window. The shell owns no agent behavior: it spawns the supported `dsh web` profile launch (`--no-open --port 0`), waits for the `dsh web: <url>` readiness line, and loads that authenticated URL into a single BrowserWindow. Application launch therefore still goes through the `dsh` profile launcher; the shell is a presentation host, not another Node application entry.

## Running

```sh
pnpm --filter @deepseek-ai/dsh-desktop run dev      # build main+preload, then launch Electron
pnpm --filter @deepseek-ai/dsh-desktop run smoke    # headless-style boot check: loads the GUI and exits 0
pnpm --filter @deepseek-ai/dsh-desktop run package  # build the self-contained macOS .app
```

Environment:

| Variable | Effect |
|---|---|
| `DSH_DESKTOP_URL` | Attach to an already-running `dsh web` instead of spawning one. |
| `DSH_DESKTOP_WORKSPACE` | Workspace root for the spawned backend (default: the user's home directory). |
| `DSH_DESKTOP_NODE` | Node binary for the backend child (default: `node` on PATH). |
| `DSH_DESKTOP_SMOKE` | `1` prints load diagnostics and exits after the GUI finishes loading. |

## What the shell provides

- Backend lifecycle: spawn through the source launcher (`node --import tsx/esm apps/cli/src/bin.ts web`), readiness on the URL line, SIGTERM-then-SIGKILL teardown on quit, and an error page with the backend log tail plus Retry when the child dies.
- Window chrome: macOS hidden-inset titlebar with an injected drag strip, window-state persistence clamped to attached displays, and a loading page while the backend boots.
- Desktop integration: application menu (New Chat, zoom, devtools), tray with Show / New Chat / Quit, a global `Cmd/Ctrl+Shift+D` show-hide shortcut, and a single-instance lock.
- Policy: navigation is pinned to the backend origin (everything else opens in the system browser), and only the backend origin may use notifications, clipboard, and fullscreen.

The pure pieces (readiness-line parsing, window-state normalization and clamping) live in `src/url-line.ts` and `src/window-state.ts` and are covered by the root vitest suite (`apps/desktop/tests`).

<a id="packaging"></a>
## Packaging

`npm run package` produces `release/mac-arm64/DeepSeek Harness.app`, which carries its own backend and runs with no Node installation and no checkout. Three steps make that work.

**The closure.** `apps/desktop/runtime` is a dependency-only deploy root naming every workspace package the web profile reaches, transitively over dependencies *and* peer dependencies — harness packages declare `@deepseek-ai/cordis` and its plugins as peers, which `pnpm deploy --prod` does not supply on their behalf. Regenerate it with `pnpm run gen-desktop-runtime-closure`; never edit it by hand.

**The staging.** [`build/stage-backend.mjs`](build/stage-backend.mjs) deploys that root into `staged-backend/` with pnpm's hoisted linker, then replaces every symlink that escapes the closure with a real copy and asserts none remain — the vendored Cordis packages are `link:` overrides, which pnpm stages as relative symlinks climbing into the repository's `vendor/`. It restores the development install afterwards, because `pnpm deploy --prod` otherwise leaves the workspace marked production.

**The placement.** [`build/after-pack.cjs`](build/after-pack.cjs) copies the staged closure into `Contents/Resources/backend`. electron-builder's `extraResources` cannot carry it: it ships the manifest and silently drops the `node_modules` tree beneath it.

At runtime the packaged application runs that closure's launcher under Electron's own Node (`ELECTRON_RUN_AS_NODE`), against a private `DSH_HOME` under `userData` seeded with a web profile whose `patchReload` is `startup`. The shipped template asks for `live`, which makes the launcher mount `cordis-plugin-hmr`, and that service needs `--expose-internals` — unavailable under Electron's Node, and pointless in a build with no rebuild watcher.

## Deliberate limits

The package is `private: true` and unpublished. The `.app` is unsigned, so a copy distributed to another machine is refused by Gatekeeper until it is signed and notarized with a Developer ID. Code signing, `dmg`/installer targets, auto-update, and `dsh://` deep-link routing are recorded as deferred work in [TODO.md](TODO.md).
