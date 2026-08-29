# Agent Note: Browser automation skill and its runtime home

Status: implemented

English | [中文](2026-08-29-browser-automation-skill.zh.md)

## Problem

A DSH session has no built-in way to drive a real web browser. A site task — navigate, click through, fill a form, read what a page says — has to launch Playwright per tool call, which cannot carry a session, and the dynamic cordis-host-runner sandbox cannot even return a screenshot. A working stack — a persistent daemon, a loopback command client, and a 14-tool `chrome-browser` plugin — lived in `tmp/dsh-browser/`, a gitignored path a skill cannot reference, and the knowledge that makes it work (why an image block crashes a turn, why a port answering `/health` proves nothing, why a snapshot selector must be unique) existed only in the debugging transcript.

## Decision

The skill `dsh-browser-automation` lives at `.agents/skills/dsh-browser-automation/`, and its runtime files ship with it under the skill's own `scripts/` directory: `daemon.cjs` (the persistent Playwright browser and its loopback HTTP command server), `call.cjs` (the one-shot client that spawns the daemon on first use and pipes the JSON payload over stdin), `plugin.host.js` (the Host-only `chrome-browser` plugin source for `cordis_define`), `config.json` (the `cdp` switch selecting attach-to-visible-Chrome), and `verify.ts` (the renderer check against the real `sandboxDefineTool` guard).

The runtime stays a dynamic plugin rather than a package under `packages/`. A Host-only dynamic package activates in the session that defines it, with no approval round trip, matching how browser work is scoped: one session drives one browser on one machine's Chrome. A package row would instead register a browser for every session of a composition, hold a Playwright browser in the host process lifecycle, and drop the `shell.run` escape the sandbox design intentionally exercises.

Paths are checkout-relative, not machine-relative. The daemon walks up from `scripts/` to the nearest `.git` to find the repository root and loads Playwright from `apps/web/node_modules/playwright`, the workspace package that declares it; runtime state (browser profiles, screenshots, logs) sits next to the scripts under a `.gitignore` in the skill directory, so the moved Chrome profile keeps its sign-in state and never lands in git. The single machine-specific value is the `CLIENT` constant in `plugin.host.js` (the absolute path of `call.cjs`), which the defining agent sets from the skill's base directory.

The guard change ships with the work: `sandboxDefineTool` in `packages/extensions/cordis-host-runner/src/guard.ts` rejects `image`, `tool-call`, and `tool-result` blocks from a sandbox renderer at registration time, because an `image` block carries an attachment reference only the attachment service can issue and the MCP-shaped substitute passed registration and then faulted in the LLM layer. Unit coverage lives in `packages/extensions/cordis-host-runner/tests/sandbox.spec.ts`.

The skill states the operator path first — start it, point it at a visible Chrome, find selectors with `browser_snapshot`, recover a wedged daemon — and the sandbox-constraint rationale after, for whoever extends the plugin. Its worked example reads a page and never mutates site state, and it cross-references the `record-browser-gif` skill instead of duplicating capture and publication rules.

## Testing

`node --import tsx/esm .agents/skills/dsh-browser-automation/scripts/verify.ts` registers all 14 tools through the real guard and shows the original image-block renderer refused at registration. `pnpm vitest run packages/extensions/cordis-host-runner` covers the guard's unmintable-block rejections. A live end-to-end run from a stopped state — nothing running, one `browser_navigate` bringing the browser up, then snapshot and text read-back — passes, and `pnpm run test:docs` clears the documentation gates.

## Alternatives considered

- **A package under `packages/`** — a first-class plugin row the composition mounts. Rejected: it would register a browser tool set for every session of every composition that mounts it, hold a Playwright browser in the host process lifecycle instead of a session-owned subprocess, and sidestep the sandbox escape the design intentionally demonstrates; the browser's ownership is session-scoped, which is exactly what a dynamic package expresses.
- **Leaving the files in `tmp/dsh-browser/`** — the working directory where the stack was debugged. Rejected: `tmp/` is gitignored, so a skill pointing there works only on the machine that debugged it.
- **`scripts/`** — rejected outright: that directory is reserved for repository gate scripts, and a long-lived runtime would pollute a gate surface.
- **A new top-level directory** — no precedent: `native/` holds vendored native helpers, `packages/` holds the package hierarchy, and `record-browser-gif` already established that a skill's own directory is where its runtime scripts live, with the skill's base directory as the path anchor.

## Consequences

- The skill is self-contained: a clone of the repository plus `pnpm install` is all a checkout needs, and the skill's base directory resolves every path except `CLIENT`, which the defining agent sets once per machine.
- The Chrome profile under `scripts/chrome-profile/` holds live sign-in state for the dedicated CDP profile; the `.gitignore` in the skill directory keeps it out of git, and the skill says plainly that the user's existing signed-in Chrome cannot be attached, because Chrome ignores `--remote-debugging-port` under its default user-data-dir.
- The guard's rejection is registration-time, so a sandbox renderer that tries to mint an image, tool-call, or tool-result block fails where the author can act on it, with a teaching message naming the fix, instead of faulting later in the LLM layer.
