# Agent Note: self-contained desktop application package

Status: implemented

English | [中文](2026-09-05-self-contained-desktop-package.zh.md)

## Problem

The [desktop Electron shell](2026-08-31-desktop-electron-shell.md) spawned `dsh web` from the repository checkout under a system Node. That is right for development and useless for a `.app`: moved to `/Applications` the shell would resolve a repository path that no longer exists, and it required a Node installation the harness cannot assume. Packaging the shell is trivial; deciding what the packaged application runs as its backend is the whole problem.

## Decision

The packaged application ships its own backend and runs it with Electron's own Node, so it needs neither a checkout nor a Node installation.

**Electron carries the backend.** The shell originally spawned a system Node because the web profile's HMR service demands `--expose-internals`, which Electron's Node does not expose. That service is only mounted because the shipped profile template declares `patchReload: live` ([`profile-boot.ts`](../../../../apps/cli/src/profile-boot.ts) creates `cordis-plugin-hmr` for live profiles). A packaged application has no rebuild watcher, so it seeds a private `DSH_HOME` under `userData` with a `patchReload: startup` web profile and runs the launcher with `ELECTRON_RUN_AS_NODE`. The development carrier is unchanged.

**The closure is generated, not curated.** `apps/desktop/runtime` is a dependency-only deploy root written by `scripts/gen-desktop-runtime-closure.ts`, which walks the workspace from the launcher and the two bundles the web profile names, following dependencies *and* peer dependencies. The peer edge is load-bearing: harness packages declare `@deepseek-ai/cordis` and its plugins as peers, and `pnpm deploy --prod` does not supply a peer on a dependency's behalf, so a hand-picked root fails one missing package at a time at boot. The single-executable closure at `python/sdk-runtime` cannot be reused — it contains no web packages.

**Staging makes the closure self-contained.** `build/stage-backend.mjs` deploys with pnpm's hoisted linker, then replaces every symlink resolving outside the closure with a real copy and asserts none remain. The vendored Cordis packages are `link:` overrides, which pnpm stages as relative symlinks climbing into the repository's `vendor/`; they resolve from the checkout and dangle the moment the application is copied elsewhere, which is exactly the case an in-repo test does not cover. A replaced package's own `node_modules` is dropped, because the closure is hoisted and copying the checkout's development tree would drag unrelated packages in. The step also restores the development install, since `pnpm deploy --prod` leaves the workspace marked production and every later pnpm command then refuses to run.

**Placement is an after-pack step.** electron-builder's `extraResources` ships the closure's manifest and silently drops the `node_modules` tree beneath it, with or without an explicit `filter`. `build/after-pack.cjs` copies the staged tree into `Contents/Resources/backend` once the app directory exists, outside the asar archive because the launcher resolves siblings from the real filesystem.

## Alternatives considered

**Reuse the single-executable build.** Rejected: `python/sdk-runtime`'s closure is SDK- and ACP-oriented and contains neither `@deepseek-ai/dsh-web-app` nor the web frontend.

**Require an installed Node or `dsh`.** Rejected for a distributable application; it remains available for development through `DSH_DESKTOP_NODE`.

**Ship the repository inside the app.** Rejected: it would carry a 2.1 GB development tree and still need tsx and a system Node.

## Verification

The `.app` is copied outside the repository and run there: the backend becomes ready, the window loads the GUI, and no backend process is orphaned on exit. That last check also fixed an August 31 defect of this shell's own — smoke mode called `app.exit`, which skips `before-quit`, leaking a backend on every run.

## Deferred

The `.app` is unsigned, so Gatekeeper refuses a copy on another machine until it is signed and notarized with a Developer ID. Installer targets, other architectures, and auto-update are recorded in `apps/desktop/TODO.md`.
