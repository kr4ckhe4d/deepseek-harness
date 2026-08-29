---
description: "The SearXNG-backed search provider for ctx.web: how deployments mount self-hosted metasearch with no API key."
kind: "package-reference"
---

# @deepseek-ai/dsh-web-search-searxng

## Summary

With `dsh-web-search-searxng`, the harness searches the web through a self-hosted SearXNG instance's JSON API. Choose it when a deployment runs (or can run) a SearXNG instance and wants keyless, self-hosted search. SearXNG returns no generated answer, so results carry no `content` — only citeable sources. A result without a URL is dropped; snippet-less and date-less results stay sources with the optional fields omitted, because SearXNG's upstream engines routinely omit them. The model-facing `web_search` tool lives in `dsh-tool-web`.

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

Mount the provider in a composition that already loads the web service; it registers as the `searxng` search provider, so pin it with `searchProvider: searxng` whenever more than one search backend is mounted.

### When to choose it

Choose this backend when a deployment has a reachable SearXNG instance with the `json` format enabled in its `search.formats`. The provider is unavailable — and every search call fails with a structured error — when the instance base URL does not parse. No credentials are needed.

### Minimal configuration

Load the web service and the provider; the instance base URL falls back to `$SEARXNG_BASE_URL` from the launch environment, then to a local default, and all other settings have safe defaults.

```yaml
- id: web
  name: '@deepseek-ai/dsh-web'
  config:
    searchProvider: searxng
- name: '@deepseek-ai/dsh-web-search-searxng'
  config:
    baseURL: http://searxng:8080
```

| Field | Default | Meaning |
|---|---|---|
| `baseURL` | `$SEARXNG_BASE_URL`, else `http://localhost:8080` | SearXNG instance base; `/search` is appended. An unparseable value makes the provider unavailable |
| `categories` | (unset) | SearXNG `categories` value (e.g. `general`, `it`); omitted = the instance default |
| `language` | (unset) | SearXNG `language` value (e.g. `en`); omitted = the instance default |

### What a search returns

Each SearXNG result maps to a `WebSearchSource`: `url`, optional `title`, `content` as `snippet`, and `publishedDate` as `publishedAt`; URL-less entries are dropped, and entries without snippet or date omit those fields. SearXNG has no result-count control, so the service enforces the request's `maxResults` by truncating and flagging. SearXNG returns no generated answer, so the result carries no `content`.

### Failures and recovery

Provider failures — HTTP errors, network failures, unparseable or wrong-shape bodies — surface as `WebError` `WEB_PROVIDER_ERROR`; an aborted request surfaces as `WEB_ABORTED`. HTTP redirects are rejected before the `Location` target is contacted and surface as `WEB_PROVIDER_ERROR`. An HTML answer instead of JSON carries an actionable hint: a 429 names the SearXNG limiter, and any other HTML page (including a 200) points at enabling `json` in the instance's `search.formats`. Callers route on the code; the model-facing `web_search` tool surfaces failures to the model under its own error wrapper.

-----

<a id="understand-the-implementation"></a>
## Understand the implementation

<details>
<summary>Implementation internals — click to expand</summary>

This section explains the design decisions behind the provider; the observable behavior is fully covered in [Use this package](#use-this-package).

### Design philosophy

The provider is a thin adapter over SearXNG's JSON API with two deliberate rules:

- **No invented fields.** A source gains `snippet` only from a real `content` and `publishedAt` only from a real `publishedDate`; SearXNG's upstream engines often return neither, so the optional fields are omitted rather than fabricated.
- **Fail loudly on misconfigured instances.** A SearXNG instance with the `json` format disabled answers with HTML. That answer is a deployment misconfiguration, not a transient failure, so it surfaces as a `WEB_PROVIDER_ERROR` naming `search.formats` instead of a raw parse error.

### Source map

| File | Role |
|---|---|
| [`src/index.ts`](src/index.ts) | Plugin entry: config schema, environment fallback, provider registration |
| [`src/provider.ts`](src/provider.ts) | The `SearxngSearchProvider`: request dispatch, abort classification, result mapping |
| [`src/types.ts`](src/types.ts) | SearXNG wire types: `SearxngSearchResponse`, `SearxngResult` |
| [`src/invariant.ts`](src/invariant.ts) | Invariant companion (no runtime invariant; contracts are enforced at the service) |

### Request and mapping flow

`search()` sends `GET {baseURL}/search?q=<query>&format=json` (plus `categories`/`language` when configured) with `redirect: 'error'` and an `accept: application/json` header, so a redirect fails the request without contacting the target. The parsed `results[]` are mapped one by one, URL-less entries dropped, and the service applies the final `maxResults` bound on the way back. An abort — a `DOMException` named `AbortError` — becomes `WEB_ABORTED`; anything else becomes `WEB_PROVIDER_ERROR`.

</details>

-----

<a id="further-exploration"></a>
## Further Exploration

Read these pages when the package-level contract is not enough. They move from the shared vocabulary to the service, the model-facing tools, and the design rationale.

- [Web subsystem](../../../docs/subsystems/web.md) — the exhaustive search request/result vocabulary and error codes.
- [Web package map](../README.md) — the search/fetch family and each role.
- [dsh-web](../web/README.md) — the web service this provider registers into.
- [dsh-tool-web](../tool-web/README.md) — the model-facing `web_search` tool that renders this provider's sources.
- [Web capability seam decision](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md) — why search and fetch share one provider-selection service.

-----

<a id="model-experience"></a>
## Model Experience

Indirectly, through `dsh-tool-web`, which retains this provider's `maxResults`-bounded URLs, titles, snippets, and publication dates or its exact `SearXNG search aborted`, `SearXNG search request failed: <error>`, and `SearXNG returned an unprocessable response body: <error>` failures under the consumer's error wrapper.

#### KV Cache effect

No direct invalidation; the named consumer owns any request-prefix changes.

## Known Limitations and Deferred Work

<a id="known-limitations-and-deferred-work"></a>

These limits define when the provider is a poor fit. They are current package constraints.

- **SearXNG's instance must enable the `json` format** — the default SearXNG settings do not; until `json` joins `search.formats`, every search fails with an actionable `WEB_PROVIDER_ERROR` instead of returning sources.
- **No result-count control** — SearXNG's JSON API accepts no count parameter, so the instance returns its full merged set and the service truncates on the way back.
- **`categories`/`language` are the only exposed instance knobs** — SearXNG's other controls (time range, safesearch level, paging) wait on provider-neutral service fields ([seam Agent Note](../../../.agents/notes/implemented/architecture/2026-06-24-web-capability-seam.md)).
- **Abort classification is error-shape-based** — only a `DOMException` named `AbortError` maps to `WEB_ABORTED`; an abort carrying a custom reason (such as `dsh-timeout`'s `TimeoutReason`) surfaces as `WEB_PROVIDER_ERROR`.

<a id="dev-note"></a>
### Dev Note

<details>
<summary>Working context for maintainers — click to expand</summary>

This Dev Note is working context for maintainers: open questions and undecided directions. It is explicitly non-authoritative — shipped behavior, limits, and rationale live in the sections above and the linked Agent Notes.

#### Future: wider SearXNG control surface

SearXNG's time range, safesearch, and paging stay unexposed. Exposing them needs provider-neutral service fields first, so the family adds one coordinated control rather than a vendor-specific argument.

</details>
