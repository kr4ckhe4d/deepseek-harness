# Agent Note: Chat and Code session modes on the blank-session hero

Status: implemented

English | [中文](2026-08-31-chat-and-code-session-modes.zh.md)

## Problem

Every Session in the Web GUI is accounted to a Workspace, and the blank-session hero refuses input until the user picks a folder. That is right for coding work and wrong for a plain question: the desktop-style home ([desktop-style home experience](2026-08-31-desktop-style-home-experience.md)) still opened onto "Choose workspace", so the product had a Code surface and no Chat surface.

## Decision

The hero gains a Chat/Code mode toggle over the Workspace machinery that already exists; no new Session kind and no second composer.

**Chat home.** `ctx.uiWorkspace` gains `chatHomePath()` and `connectChatHome()`. The chat home is the Host home directory as reported by the ready frame's `RemoteHostFacts.home`, registered as an ordinary Workspace on first use. Chat mode therefore provisions nothing: the harness cannot create a directory here (the composed `directoryPicker` serves the `native` capability, whose seam has no `createDirectory`; only the `browse` capability does), and the home directory is the one path guaranteed to exist. Registration is idempotent by canonical path, so a `home` spelling that differs from the stored one resolves the same Workspace instead of adding a row, and an already-registered home keeps its own title — chat never renames a Workspace the user owns.

**Mode is derived, not stored.** `chatActive` compares the Session's effective Workspace path against the chat home, with a pending flag bridging the click-to-connect window. There is no durable "mode" field to drift from the Session's actual cwd, and reopening a chat Session lands in Chat mode on its own.

**Presentation.** Chat hides the Workspace chip and the `conversation.hero.dashboard` seat (a chat has no project to report on) and swaps the composer placeholder. Because the chip carries the Workspace picker's anchor ref, the Code button takes that ref while chat is active, so choosing Code opens the picker from the control the user actually clicked.

`selectWorkspace` and `startChat` now share one `openConnected` tail, so a half-typed draft and its images follow the user across a mode switch exactly as they already followed a Workspace switch.

## Alternatives considered

**Provision a dedicated `~/Chats` directory.** Implemented first, then reverted: `directoryPicker.createDirectory` is refused by the native picker this deployment composes, so the directory was never created and the Workspace registration failed. Making it work needs a new host-side provisioning verb; recorded as deferred work rather than widening the wire for this pass.

**Register the home Workspace under a "Chats" title.** Rejected: `workspace.create` is idempotent, so a user who had already registered their home would have had it silently retitled.

**A durable per-Session mode flag.** Rejected: it would duplicate a fact the Session's cwd already carries and could disagree with it.

## Verification

Four service tests cover first-use registration, reuse of an already-registered home, and the pre-ready refusal; five component tests cover the derived mode, the hidden chip and dashboard, the connect call, its inertness while chat already holds, and the disabled toggle before the Host home is known. Verified live against `dsh web`: Chat starts a Session with no folder prompt, Code reopens the picker, and both directions restore their own chrome.
