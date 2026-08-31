# Desktop app progress

Working checklist for the Claude-Desktop-style shell on branch `feature/desktop-app`. Kept current as work lands; items move to Done with a one-line result.

## Milestone 1 — foundation

- [x] Branch `feature/desktop-app` created from the synced `master`.
- [x] Workspace scaffold: `apps/desktop` package, Electron 44 dependency, `allowBuilds` entry for Electron's binary download, `dist/` gitignored.
- [x] Backend lifecycle: spawn `dsh web --no-open --port 0` through the supported launcher, treat the `dsh web: <url>` line as the readiness signal, terminate the child on quit (SIGTERM, SIGKILL after 5s).
- [x] Window shell: loading screen while the backend boots, then the authenticated web GUI; macOS hidden-inset titlebar with an injected drag strip; 640×480 minimum size.
- [x] Window-state persistence: bounds + maximized flag in `userData/window-state.json`, normalized on read and clamped to a currently attached display.

## Milestone 2 — desktop chrome

- [x] Application menu: File (New Chat ⌘N), Edit roles, View (reload, zoom, devtools, fullscreen), Window; macOS app menu.
- [x] Navigation policy: window pinned to the backend origin; every other link opens in the system browser (`setWindowOpenHandler` + `will-navigate`).
- [x] Single-instance lock; a second launch focuses the existing window.
- [x] Tray icon (generated 16px template PNG) with Show / New Chat / Quit, plus global `Cmd/Ctrl+Shift+D` show-hide.
- [x] Permission grants (notifications, clipboard, fullscreen) for the backend origin only.
- [x] Error screen with the backend log tail (last 40 lines) and a Retry button wired over IPC to respawn the backend.

## Milestone 3 — verification and docs

- [x] Unit tests for the pure modules (`url-line`, `window-state`): 11 tests, running in the root vitest suite via the `apps/*/tests` glob.
- [x] Automated smoke run: `pnpm --filter @deepseek-ai/dsh-desktop run smoke` boots Electron, spawns the backend, loads the GUI (`title=DSH Local Build`), exits 0.
- [x] Bilingual README for `apps/desktop` and Agent Note `.agents/notes/implemented/feature/2026-08-31-desktop-electron-shell.md`, with pairing sidecars recorded.
- [x] `tsc --noEmit` and repo oxlint clean for `apps/desktop`; work committed on the branch.

## Deferred (recorded, intentionally out of this pass)

- Installer packaging (electron-builder dmg/nsis/AppImage) and code signing.
- Auto-update.
- `dsh://` deep-link routing beyond focusing the window.
- Native push notifications driven by session events (the web GUI's own notifications work once permission is granted).
- Packaged-app backend launch (today the shell launches the in-repo source vector; a packaged build needs the installed `dsh` bin instead).

## Done log

- 2026-08-31: branch created; explored the existing web GUI stack (`dsh web` boots host+client, prints `dsh web: <tokenized url>` as its readiness line; verified it serves without an API key).
- 2026-08-31: scaffolded `apps/desktop`; Electron 44 installed with its binary via the new `allowBuilds` entry.
- 2026-08-31: backend spawn debugged through two real failures — Electron-as-Node breaks the HMR row's loader internals (fixed: spawn the system `node`), and tsx resolves tsconfig from the child cwd so workspace imports fell back to stale built lib when the workspace was `$HOME` (fixed: pin `TSX_TSCONFIG_PATH` to the repo `tsconfig.base.json`).
- 2026-08-31: smoke run green end-to-end; typecheck, lint, and the 11 unit tests pass; docs and Agent Note written.
