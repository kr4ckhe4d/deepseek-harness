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

## Milestone 4 — Claude-Desktop-style home & chrome

- [x] Profile settings: `ui-profile` namespace (full name + nickname) registered host-side by ui-settings-general; two commit-on-blur Profile rows on the Settings General page edit it (pending drafts also commit on unmount).
- [x] Personalized hero greeting: serif time-of-day greeting ("What's up next, {name}?") once a name is set, chosen by local-time band + day parity from eight bilingual templates; stock headline otherwise.
- [x] Home usage dashboard: new `conversation.hero.dashboard` slot on the blank-session hero, filled by ui-settings-usage with a compact Overview/Models card sharing the Settings page's store (tiles, streaks, heatmap, model chart, All/30d/7d).
- [x] Sidebar account footer: the settings trigger is now an account row (initials avatar + display name, "Local user" fallback) opening a popover menu — Settings, Language (jumps to General), Get help — before the modal.
- [x] Sidebar New pill: ⌘N / Ctrl+N hint on the wide New Session bar plus a document-level binding (effective in the desktop shell; browsers reserve the chord).
- [x] Rebuilt all 162 client bundles, verified live in the browser (greeting, both card tabs, account flow, profile persistence across restarts); 518 tests green across the touched packages, client typecheck and lint clean, client slot catalog regenerated, READMEs and Agent Note updated bilingually.

## Milestone 5 — Chat and Code session modes

- [x] Chat home seam: `ctx.uiWorkspace.chatHomePath()` / `connectChatHome()` register the Host home directory as a Workspace on first use (idempotent by canonical path; an already-registered home keeps its title).
- [x] Hero mode toggle: Chat / Code segmented control leading the hero row; Chat starts a Session with no folder prompt, Code opens the Workspace picker anchored on the Code button.
- [x] Chat presentation: Workspace chip and usage-dashboard seat hidden, composer placeholder swapped to "How can I help you today?".
- [x] Mode is derived from the Session's Workspace path (no durable flag), so reopening a chat Session lands in Chat mode.
- [x] Draft and images carry across a mode switch (shared `openConnected` tail with `selectWorkspace`).
- [x] 9 new tests (4 service, 5 component); 609 tests green across the touched packages; typecheck, lint, catalog, and bilingual docs done.

## Deferred (recorded, intentionally out of this pass)

- Installer packaging (electron-builder dmg/nsis/AppImage) and code signing.
- Auto-update.
- `dsh://` deep-link routing beyond focusing the window.
- Native push notifications driven by session events (the web GUI's own notifications work once permission is granted).
- Packaged-app backend launch (today the shell launches the in-repo source vector; a packaged build needs the installed `dsh` bin instead).
- A dedicated `~/Chats` directory for chat sessions instead of the Host home: blocked on a host-side provisioning verb, because the composed native `directoryPicker` refuses `createDirectory` (only the `browse` capability implements it).

## Done log

- 2026-08-31: branch created; explored the existing web GUI stack (`dsh web` boots host+client, prints `dsh web: <tokenized url>` as its readiness line; verified it serves without an API key).
- 2026-08-31: scaffolded `apps/desktop`; Electron 44 installed with its binary via the new `allowBuilds` entry.
- 2026-08-31: backend spawn debugged through two real failures — Electron-as-Node breaks the HMR row's loader internals (fixed: spawn the system `node`), and tsx resolves tsconfig from the child cwd so workspace imports fell back to stale built lib when the workspace was `$HOME` (fixed: pin `TSX_TSCONFIG_PATH` to the repo `tsconfig.base.json`).
- 2026-08-31: smoke run green end-to-end; typecheck, lint, and the 11 unit tests pass; docs and Agent Note written.
- 2026-08-31: Chat/Code modes shipped. Three real bugs found while verifying in the browser: `~/Chats` provisioning silently failed (the native directory picker has no `createDirectory`, so chat now uses the Host home), the Chat toggle created a Session but never opened it (`startChat` skipped the open/draft-migration tail `selectWorkspace` already had), and the Code button did nothing in chat mode (the picker's anchor ref lived on the hidden Workspace chip).
- 2026-08-31: desktop-style home shipped across four existing client packages (no new package): profile settings + serif greeting + hero usage dashboard + account footer menu + New pill shortcut. Two real bugs found while verifying in the browser: a profile draft typed then closed with Escape vanished (fixed: commit pending drafts on field unmount), and the dashboard card first shipped with a light-layer token in dark mode (fixed: the composer's `--dsw-specific-input-major`). Existing trigger/apply/snapshot tests updated with the behavior they describe.
