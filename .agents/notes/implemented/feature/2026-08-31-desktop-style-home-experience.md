# Agent Note: desktop-style home experience in the web GUI

Status: implemented

English | [中文](2026-08-31-desktop-style-home-experience.zh.md)

## Problem

With the Electron shell in place ([desktop Electron shell](2026-08-31-desktop-electron-shell.md)), the harness window still opened on an impersonal blank-session hero, and the usage statistics the fork already aggregates were reachable only through the Settings modal. A desktop-product home shows who you are, what you have been doing, and where your account controls live — without a second UI stack.

## Decision

Four existing client packages gained the desktop-style home; no new package and no new roster row.

- **ui-settings-general** owns the durable `ui-profile` namespace (fullName, nickname; both default `''`) registered by its node half, edits it through two commit-on-blur Profile rows on the General page (a pending draft also commits on unmount, so closing the dialog cannot drop a typed name), and turns the sidebar-foot settings trigger into an account row — initials avatar plus display name — that opens a menu (Settings, Language, Get help) before the panel.
- **ui-conversation** declares the new single root slot `conversation.hero.dashboard` rendered under the hero composer, and personalizes the hero headline: with a profile name it shows a serif time-of-day greeting (`greetingKeyFor` picks one of eight dictionary templates by local-time band and day parity), otherwise the stock headline and preview badge. It reads the profile through its own `settingsScope.bind` on the wire-known `ui-profile` namespace with a defensive decode — the client bundle purity gate forbids cross-plugin value imports, so the namespace name is the shared fact, not a shared constant.
- **ui-settings-usage** fills the hero seat with a compact card of its existing Overview/Models tabs, reusing the same `UsageStore` instance as the Settings section, so both surfaces always agree; the card stays quiet on errors and on a sessionless corpus.
- **ui-sidebar** adds a platform-aware shortcut hint to the wide New Session bar and a document-level Cmd/Ctrl+N binding (effective in the desktop shell; most browsers reserve the chord).

## Alternatives considered

**A dedicated home/dashboard client package.** Rejected for this pass: every piece extends a surface an existing package already owns (its settings page, its hero, its trigger), and a new package would add roster wiring and an invariant/coverage surface without new ownership.

**Sharing the profile constants through a value import.** Rejected: the client bundle purity gate forbids cross-plugin value imports; the conversation side binds the namespace by its wire name with its own decode.

## Verification

Existing behavior tests were updated with the behavior they describe (trigger now opens the account menu; the shell seats a General item; sidebar snapshots carry the hint). New unit tests cover `greetingKeyFor` band/parity selection and the profile helpers. Verified live against `dsh web`: greeting with nickname, dashboard card on both tabs, account menu flow, and profile persistence across restarts.
