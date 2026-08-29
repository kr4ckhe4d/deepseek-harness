# Agent Note: Model usage statistics settings section

Status: implemented

English | [中文](2026-08-29-model-usage-statistics-settings.zh.md)

## Problem

The session log already records everything a usage dashboard needs — every `assistant/message` event carries the step's model id (`message.source.model`) and the provider-reported token accounting (`usage`), with `user/message` events for message counts — but nothing surfaced it. A user had no way to see how many sessions, messages, or tokens they had run, which model they used most, or how their activity clustered by day and hour, short of reading `session.log` files.

Building the surface means choosing where the aggregation runs and how the time-zone-dependent bucketing (local days, local hours, weekly buckets, streaks) is computed, since the client's clock and the Host's clock are not the same.

## Decision

A new read-only settings section, "Model usage" (`@deepseek-ai/dsh-client-ui-settings-usage`), registers on `settings.section` with two tabs — Overview and Models — plus an All / 30d / 7d range filter applying to both. The Overview tab renders eight stat cards (sessions, messages, total tokens, active days, current and longest streaks, peak hour, favorite model) and a GitHub-style calendar heatmap of daily token volume; the Models tab renders a stacked weekly bar chart split by model and a legend table with each model's input/output totals and share, capped at the top six with a "Show N more" expander. Model ids come verbatim from the request log, never from a hardcoded list.

The Host stays the single fact source, matching the settings surface's other pages: `SessionController` gains a `session.usage` Remote method backed by `SessionUsageController` (`packages/api/session-controller/src/usage.ts`). It lists every visible session (`cwd` present, the Session list's own visibility rule), folds each log into surface messages (user/assistant messages plus the per-request model and billed tokens), and aggregates in the client-supplied IANA time zone (the prompt RPC's `clientTimeZone` pattern reused). All bucketing — local-day streaks, peak hour, the heatmap day series, Sunday-aligned weekly buckets — happens Host-side with `Intl.DateTimeFormat` in the requested zone, so the client sends no raw events over the wire and does no calendar math.

Aggregation is on-demand with bounded concurrency over cold persisted-session reads (per-session tolerance mirrors the Session list's cold-summary policy: one unreadable session is skipped, not fatal), with no persistent cache — the settings page opens rarely, and pushed `api-session/activity` invalidations refresh an already-open page. The `usage` result is bounded: the day series spans the range window (364 days for `all`), the weekly chart spans the same window, and per-model rows are pre-aggregated, so the payload is small regardless of corpus size.

## Client-store contract

The section's page store (`UsageStore`) calls `session.usage({ range, timeZone })` with the browser's resolved IANA zone and keeps the range as the refetch key; a generation counter fences stale responses. The component receives the store through the slot inject face (`controller`, `hooks.snapshot`, `api`, `t`) exactly like the Models settings page, renders nothing until injected, and owns no extension seats — the section is read-only.

## Data semantics

- **Messages** count every `user/message` and `assistant/message` surface event in range.
- **Tokens** are billed totals (uncached input + cache reads + cache writes + output) from `assistant/message.usage`, present only when the adapter reported usage; a usage-less adapter still contributes messages and activity but zero tokens.
- **Streaks** and **active days** run on local-day buckets within the selected range, so 30d/7d windows truncate streaks at the window start.
- **Favorite model** is the highest-token model in range (`null` when there is none).
- **Peak hour** is the local hour with the most messages; ties pick the earliest hour.

## Alternatives considered

- **Client-side aggregation** — paging every session's full journal into the browser and folding there. Rejected: it ships raw event logs over the wire (chunk rows included), duplicates Host reading machinery, and still needs a Host corpus listing; Host-side aggregation returns one small JSON view instead.
- **A per-session projection unit** (the `session-stats` precedent) persisted in the projection cache. Rejected: day/hour/week bucketing depends on the client's time zone, which a durable projection cannot know, and the corpus-wide aggregate still requires scanning every session; on-demand folding keeps the code in one place and the settings page opens too rarely to justify cache invalidation.
- **A dedicated host package for the fold** — rejected as over-splitting; `session-controller` already owns the Session Remote's cold reads (`list`, `history`), and the fold is a pure module inside it with unit coverage.

## Consequences

- **Opens cost a corpus scan**: the first open of the Usage page folds every visible session log once; very large corpora are slower, and the view is only as fresh as the last refetch or pushed invalidation.
- **Time-zone bucketing is fetch-time**: a page left open across a time-zone change keeps the previously fetched buckets until the next range change or invalidation.
- **Token totals under-report adapters without usage accounting** — documented in the README's Known Limitations.
- **The Remote boundary forced JSON-safe nulls**: `favoriteModel` is `string | null`, not `string | undefined`, because Typert rejects `undefined` at Remote boundaries.
