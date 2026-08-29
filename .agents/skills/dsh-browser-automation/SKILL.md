---
name: dsh-browser-automation
description: Drive a real, visible web browser from DeepSeek Harness through a dynamic cordis-host-runner plugin — a persistent Playwright daemon exposed as 14 browser_* model tools. Use when the user asks to browse a site, open or click through a page, add something to a cart, check what a page says, fill a form, take a screenshot of a live page, or drive Chrome. Not for one-shot URL fetches (web_fetch) or for recording demo GIFs (record-browser-gif, which uses this skill as its browser layer).
---

# DSH Browser Automation

This skill drives a real web browser from a DSH session: a dynamic Host-only `chrome-browser` plugin registers 14 `browser_*` model tools, and every tool reaches one persistent Playwright browser through a daemon that outlives individual tool calls. The runtime files live in this skill's own directory — `scripts/daemon.cjs`, `scripts/call.cjs`, `scripts/plugin.host.js`, `scripts/config.json`, `scripts/verify.ts` — committed here so the skill works in any checkout of this repository, with machine state (browser profiles, screenshots, logs) kept next to the scripts by a `.gitignore` in this directory.

## Start it

1. Prerequisites: `pnpm install` has populated `apps/web/node_modules/playwright` (the daemon loads Playwright from that exact path and says so in its error when it is missing), and on macOS Google Chrome sits at its standard path unless `config.json` overrides `chrome`.
2. Optional but usually wanted — point the daemon at a visible Chrome so the work is watchable: write `{ "cdp": "http://127.0.0.1:9223" }` to `scripts/config.json`. With no config (or no `cdp` key) the daemon launches its own bundled headless Chromium, which works but is invisible — a headless browser "works" while the user sees nothing — so prefer the CDP mode when a person is watching.
3. Set the one machine-specific value: in `scripts/plugin.host.js`, `CLIENT` must be the absolute path of `scripts/call.cjs` in this checkout.
4. Define the plugin with `cordis_define` (new plugin, idPrefix `brow`), passing the contents of `scripts/plugin.host.js` as `code.host` with no client half, then `cordis_run` in mode `run`. A Host-only package activates immediately — there is no approval round trip and no page to connect.
5. Prove it: `browser_status`, then `browser_navigate` to a known page. The first call starts everything: `call.cjs` probes the daemon port, spawns `daemon.cjs` detached when the port is dead, and the daemon brings up the browser. Nothing needs to be started by hand.

## Operate it

- To understand a page, `browser_get_text` (whole page, or with a selector for one element); it is capped and reports `truncated`.
- To find what can be clicked or filled, `browser_snapshot`, optionally with `match` to filter by label. Every element it lists carries a unique pure-CSS `selector` — take selectors from the snapshot. A page the agent has not seen cannot be guessed against, and an ambiguous selector does not error — it hits the wrong element: the Umart product page carries twelve "Add To Cart" buttons, ten of them from a recommendations carousel.
- Multi-step flows work because one browser and one page persist across tool calls: navigate, snapshot, click, snapshot again. A site that opens a new tab (checkout, SSO) automatically becomes the active page.
- `browser_new_tab`, `browser_list_tabs`, `browser_select_tab`, `browser_close_tab` manage tabs; `browser_back` walks history; `browser_wait_for` blocks until a selector appears.
- `browser_screenshot` writes a PNG under `scripts/shots/` and returns its path; it never inlines an image, because the sandbox cannot mint one (below).
- State-changing actions (adding to a cart, submitting a form, checking out) mutate real site state, often in the user's signed-in profile: announce them to the user before the call and keep the worked example below to reading.

### Worked example (read-only)

1. `browser_navigate` `https://example.com` — the daemon starts, Chrome (or bundled Chromium) opens the page.
2. `browser_get_text` — the page text comes back with its URL and title.
3. `browser_snapshot` with `match: "learn more"` — the one link on the page is listed with its unique pure-CSS selector, here `body > div > p:nth-of-type(2) > a`.
4. `browser_click` on that snapshot selector, then `browser_get_text` again — the same page object now holds the target page.

## Recover when it is wedged

- A dead browser exits the daemon, which frees the port, so the next `browser_*` call simply starts a fresh daemon and a fresh browser — no manual recovery for the common case. The failure that needs a hand is a daemon whose browser died without exiting: that daemon answers `/health` while every action returns "target closed". Kill it by exact match on its command line (`daemon.cjs` under this skill's `scripts/` directory) — never a broad `pkill` pattern, which can match the shell that launched it — and let the next call restart it.
- A stuck launch leaves Chromium singleton locks in `scripts/profile/`; the daemon clears `SingletonLock`, `SingletonCookie`, and `SingletonSocket` before every launch, so a killed Chromium cannot wedge the next one.
- A CDP Chrome that was closed by hand is detected on disconnect: the daemon exits, and the next call relaunches Chrome on the configured port into the dedicated profile.
- `scripts/daemon.log` and `scripts/chrome.log` (next to the scripts, gitignored) hold the daemon's and Chrome's own output; the health probe, the launch poll, and the spawn retry loop in `call.cjs` all report there on failure.

## Why the pieces are shaped this way

These constraints cost real debugging time; each one is load-bearing for anyone extending the plugin.

- **A sandboxed plugin cannot return an image.** The core `ImageBlock` is `{ type: 'image', attachment: ImageAttachmentRef }`, and only the attachment service can issue the reference; the sandbox harness exposes only `defineTool`, `registerTool`, and `handle`, so a renderer cannot mint one. The MCP-style substitute `{ type: 'image', mimeType, data }` is rejected at registration by the guard in `packages/extensions/cordis-host-runner/src/guard.ts` — past registration such a block faults in the LLM layer with `Cannot read properties of undefined (reading 'attachmentId')`, far from the renderer that produced it — and the guard rejects `tool-call` and `tool-result` blocks for the same reason: those records are written by the agent loop. Every renderer here therefore returns text, and screenshots report a path.
- **`shell.run` is the only escape hatch.** The `node:vm` sandbox traps `require`, `fetch`, `setTimeout`, and friends (see `packages/extensions/cordis-host-runner/src/sandbox.ts`), so anything that needs Node or the network goes through a subprocess — which is the whole daemon design: the plugin shells out to `call.cjs`, and the daemon holds the browser.
- **A browser launched per tool call cannot hold a session.** A browser launched inside a `shell.run` command dies with the command, so a navigate followed by a click lands in two different browsers and no multi-step flow can work. The daemon exists because the page, not the command, must be the persistent object.
- **Never interpolate data into the shell command.** The JSON payload goes over stdin (`ShellExecSpec.stdin`), so a selector or typed string containing a quote can never reshape the command it sits in.
- **Daemon liveness must mean the browser, not the port.** A daemon whose browser died kept answering `/health` while every action failed with "target closed". `/health` therefore checks page liveness, the daemon exits when the browser closes (freeing the port so the next call starts fresh), and stale Chromium singleton locks are cleared before launch.

## Verify

- `node --import tsx/esm .agents/skills/dsh-browser-automation/scripts/verify.ts` — registers all 14 tools through the real `sandboxDefineTool` guard and proves the original image-block renderer is refused at registration, not mid-turn.
- `pnpm vitest run packages/extensions/cordis-host-runner` — the guard's unit coverage for the unmintable-block rejection.
- Live end-to-end from a stopped state: nothing running, one `browser_navigate` brings the browser up, then snapshot and read text back.

## Recording demos

A demo GIF of browser or Web UI work is recorded by [record-browser-gif](../record-browser-gif/SKILL.md), which owns storyboard selection, frame capture, encoding, and publication; this skill is the browser layer it drives. Cross-reference rather than duplicate: the GIF skill's setup and provenance rules stay in that skill.
