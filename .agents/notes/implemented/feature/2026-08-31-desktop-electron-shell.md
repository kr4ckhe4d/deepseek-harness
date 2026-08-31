# Agent Note: desktop Electron shell over the dsh web GUI

Status: implemented

English | [中文](2026-08-31-desktop-electron-shell.zh.md)

## Problem

The harness ships browser and terminal surfaces but no native desktop application. A desktop shell must not become a second application launcher: the launch rule keeps `dsh` profiles as the only supported Node application entry, and the web GUI already carries the complete product surface (sessions, tools, approvals, settings).

## Decision

`apps/desktop` (`@deepseek-ai/dsh-desktop`, private) is an Electron presentation host over the existing web profile. It spawns `node --import tsx/esm apps/cli/src/bin.ts web --no-open --port 0`, treats the `dsh web: <url>` line as the readiness signal, and loads that authenticated URL into one BrowserWindow. The shell owns only desktop concerns: window-state persistence clamped to live displays, a loading page and an error page with the backend log tail and Retry, an application menu, a tray, a global show-hide shortcut, a single-instance lock, origin-pinned navigation with external links handed to the system browser, and permission grants (notifications, clipboard, fullscreen) restricted to the backend origin.

Two launch facts shape the spawn: the child runs a real Node binary because Electron-as-Node breaks the loader internals the web profile's HMR row requires, and the child env pins `TSX_TSCONFIG_PATH` to the repository `tsconfig.base.json` because tsx discovers tsconfig from the child's cwd — which is the user's workspace root, not the repository — and without the paths map the workspace imports fall back to possibly stale built `lib/`.

Pure pieces (`src/url-line.ts`, `src/window-state.ts`) are unit-tested in the root suite via the existing `apps/*/tests` glob; `DSH_DESKTOP_SMOKE=1` gives a self-terminating boot check that loads the GUI and exits 0. Electron's binary download is allowlisted in `pnpm-workspace.yaml` `allowBuilds`.

## Alternatives considered

**Compose an inline plugin tree inside the Electron main process.** Rejected: it would create a second application launcher and duplicate the web profile's assembly; the launch rule exists precisely to prevent this.

**Reuse the Electron binary as the backend's Node (`ELECTRON_RUN_AS_NODE`).** Rejected after testing: the profile boots and prints its URL, but the HMR row crashes because the loader's module internals are unavailable under Electron's patched module system.

## Deferred

Installer packaging, code signing, auto-update, and `dsh://` deep-link routing are recorded in `apps/desktop/TODO.md`.
