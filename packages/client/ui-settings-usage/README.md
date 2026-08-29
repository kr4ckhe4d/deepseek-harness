---
description: "Model usage statistics settings section for the dsh web client: overview cards, a calendar heatmap, weekly per-model token charts, and per-model input/output totals over the recorded session log."
kind: "package-reference"
---

# @deepseek-ai/dsh-client-ui-settings-usage

English | [中文](README.zh.md)

## Summary

`dsh-client-ui-settings-usage` is the Model usage settings page of the dsh web client: it reads the Host's aggregated view of every visible session log and shows what you have been doing with models. The Overview tab renders eight stat cards — sessions, messages, total tokens, active days, current and longest streaks, peak hour, and favorite model — plus a GitHub-style calendar heatmap of daily token volume. The Models tab renders a stacked weekly bar chart split by model and a legend table with each model's input/output token totals and share of usage. A time-range filter (All / 30d / 7d) applies to both tabs, and every figure is bucketed in your browser's time zone.

## Table of Contents

- [Use this package](#use-this-package)
- [Understand the implementation](#understand-the-implementation)
- [Further Exploration](#further-exploration)
- [Model Experience](#model-experience)
- [Known Limitations and Deferred Work](#known-limitations-and-deferred-work)
- [Dev Note](#dev-note)

-----

<a id="use-this-package"></a>
## Use this package

Open the Usage page from the Settings navigation. Pick a range filter to narrow every number to the trailing 7 days, the trailing 30 days, or all history, then switch between the two tabs.

### Overview

Eight cards summarize the range: total sessions and messages, total tokens (billed input plus cache plus output, formatted compactly), distinct active days, the current consecutive-day streak ending today (0 when today is inactive), the longest historical run of active days, the local hour with the most messages, and the model with the most tokens. Below the cards, the calendar heatmap shades each local day by its token volume against the window maximum — four buckets plus empty cells for inactive days — with weekday rows, month labels, and a Less/More legend.

### Models

The stacked bar chart shows each week's token volume split by model, auto-scaled with a compact axis. The legend table below lists every model that appears in the range, sorted by token share, with a color swatch, the model id exactly as recorded on the request, its input and output token totals, and its percentage of the range's total. When more than six models exist, the table shows the top six and a "Show N more" expander.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

The section is read-only: it owns no extension seats and writes nothing. Its page store calls the Host `session.usage` Remote method with the selected range and the browser's resolved IANA time zone, then renders the returned view; a range change refetches, and pushed session-activity invalidations refresh an already-open page without polling.

The Host stays the single fact source. It lists every visible session, folds each log into surface messages (user and assistant messages, plus the per-request model id and token accounting that `assistant/message` events already carry), and aggregates in the requested time zone: local-day buckets for the heatmap and streaks, local-hour counts for the peak hour, per-model totals, and Sunday-aligned weekly buckets for the Models chart. Aggregation runs on demand with bounded concurrency over cold persisted-session reads, and one unreadable session is skipped rather than failing the whole read.

### Copy and locale

All copy is bilingual (zh/en) under the `settings.usage` dictionary namespace; compact token suffixes and digit grouping reuse the shared locale vocabulary, so formatting stays locale-owned.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

- [ui-settings-models](../ui-settings-models/README.md) — the Models settings page, which configures the providers whose usage this section reports.
- [ui-settings-general](../ui-settings-general/README.md) — the settings shell this section registers into.
- [api-session-controller](../../api/session-controller/README.md) — the Host Session Remote owner, including the `session.usage` aggregate.

-----

<a id="model-experience"></a>
## Model Experience

### Recorded request usage

#### What the model sees

Nothing new: the section renders existing logged events and adds no prompt, tool schema, or system content; it reads the durable session log through the Host `session.usage` aggregate.

#### Token effect

No new tokens: the section only renders recorded usage figures, and the Host aggregate it reads performs no model calls.

#### KV Cache effect

No direct invalidation; nothing in this package reads or writes the KV cache.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define the statistics' freshness and coverage; they are current package constraints.

- **Token totals only count usage-reporting steps** — an adapter that reports no usage still contributes messages and activity, but its steps add zero tokens.
- **Aggregation is on-demand** — opening the Usage page folds every visible session log once; very large corpora make the first open slower, and the view is only as fresh as the last refetch.
- **Bucketing follows the fetch-time time zone** — a page left open across a time-zone change keeps the previously fetched buckets until the next range change or invalidation.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

None.

</details>
