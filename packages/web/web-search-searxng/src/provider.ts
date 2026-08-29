/**
 * `SearxngSearchProvider`: a `WebSearchProvider` backed by a SearXNG instance's
 * JSON API (`GET /search?format=json`). It maps `url`, `title`, `content` to
 * `snippet`, and `publishedDate` to `publishedAt`. SearXNG's upstream engines
 * often omit snippets and dates, so snippet-less and date-less entries stay
 * sources with the optional fields omitted. `content` is always omitted
 * because SearXNG returns no generated answer.
 * @module @deepseek-ai/dsh-web-search-searxng/provider
 */

import { WebError } from '@deepseek-ai/dsh-web'
import type {
  WebSearchProvider,
  WebSearchRequest,
  WebSearchResult,
  WebSearchSource,
} from '@deepseek-ai/dsh-web'
import type { SearxngResult, SearxngSearchResponse } from './types.ts'

/** Stable id this provider registers under. */
export const SEARXNG_PROVIDER_ID = 'searxng'

/** Default SearXNG instance base URL (a local instance on its default port). */
export const SEARXNG_DEFAULT_BASE_URL = 'http://localhost:8080'

/** Attribution header sent on every request. Bump with the package version. */
const USER_AGENT = 'deepseek-harness/0.1.2'

/** Resolved provider options (the plugin's `apply` supplies env-var and constant defaults). */
export interface SearxngSearchProviderOptions {
  /** Instance base URL; `/search` is appended. Must parse as an absolute URL. */
  baseURL: string
  /** SearXNG `categories` value (e.g. `general`, `it`); omitted = the instance default. */
  categories?: string
  /** SearXNG `language` value (e.g. `en`); omitted = the instance default. */
  language?: string
}

/**
 * Map one SearXNG result to a normalized source, or `undefined` when it carries
 * no usable URL. Snippet and date are omitted rather than invented: SearXNG's
 * upstream engines routinely return neither.
 *
 * @param result - one entry of SearXNG's `results[]`.
 * @returns the normalized source, or `undefined` when the entry has no
 *   non-blank URL.
 */
export function mapSearxngResult(result: SearxngResult): WebSearchSource | undefined {
  const url = result.url
  if (url === undefined || url === null || url.length === 0) return undefined
  return {
    url,
    ...isNonBlankString(result.title) ? { title: result.title } : {},
    ...isNonBlankString(result.content) ? { snippet: result.content } : {},
    ...isNonBlankString(result.publishedDate) ? { publishedAt: result.publishedDate } : {},
  }
}

/**
 * Map a SearXNG response envelope to a normalized search result.
 *
 * @param response - the parsed `GET /search` response body.
 * @returns the normalized result; URL-less entries are dropped
 *   ({@link mapSearxngResult}). `content` is omitted: SearXNG returns no
 *   generated answer, and the web service owns the final `maxResults`
 *   truncation, so this provider reports `truncated: false`.
 */
export function mapSearxngResponse(response: SearxngSearchResponse): WebSearchResult {
  const sources = (response.results ?? [])
    .map(mapSearxngResult)
    .filter((source): source is WebSearchSource => source !== undefined)
  return { sources, truncated: false }
}

/** The SearXNG-backed search provider; HTTP redirects fail as `WEB_PROVIDER_ERROR`. */
export class SearxngSearchProvider implements WebSearchProvider {
  readonly id = SEARXNG_PROVIDER_ID

  constructor(private readonly options: SearxngSearchProviderOptions) {}

  available(): boolean {
    return URL.canParse(this.options.baseURL)
      && (this.options.categories === undefined || this.options.categories.length > 0)
      && (this.options.language === undefined || this.options.language.length > 0)
  }

  async search(request: WebSearchRequest, signal?: AbortSignal): Promise<WebSearchResult> {
    const params = new URLSearchParams({ q: request.query, format: 'json' })
    if (this.options.categories !== undefined && this.options.categories.length > 0) {
      params.set('categories', this.options.categories)
    }
    if (this.options.language !== undefined && this.options.language.length > 0) {
      params.set('language', this.options.language)
    }
    let response: Response
    try {
      response = await fetch(`${this.options.baseURL}/search?${params.toString()}`, {
        method: 'GET',
        redirect: 'error',
        headers: {
          'accept': 'application/json',
          'user-agent': USER_AGENT,
        },
        ...signal !== undefined ? { signal } : {},
      })
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('SearXNG search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`SearXNG search request failed: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }

    if (!response.ok) {
      const status = response.status
      let message = `SearXNG API error (HTTP ${status})`
      if (isHtmlResponse(response)) {
        message += status === 429
          ? ' — the instance rate-limited the request (SearXNG limiter); raise its rate limits or retry later'
          : ' — the instance answered with an HTML page; check that `json` is listed in its `search.formats` and that it is reachable'
      }
      throw new WebError(message, 'WEB_PROVIDER_ERROR')
    }

    // Some SearXNG configurations answer a `format=json` request with an HTML
    // error page at 200 when the JSON format is disabled. Fail loudly with the
    // actionable fix instead of a raw JSON parse error.
    if (isHtmlResponse(response)) {
      throw new WebError(
        'SearXNG returned an HTML page for a JSON search request; add `json` to the `search.formats` list of its settings.yaml',
        'WEB_PROVIDER_ERROR',
      )
    }

    try {
      const payload = await response.json() as SearxngSearchResponse
      return mapSearxngResponse(payload)
    } catch (error: unknown) {
      if (isAbortError(error)) throw new WebError('SearXNG search aborted', 'WEB_ABORTED', { cause: error })
      throw new WebError(`SearXNG returned an unprocessable response body: ${String(error)}`, 'WEB_PROVIDER_ERROR', { cause: error })
    }
  }
}

/** True for a non-blank string (blank optional fields are omitted, not sent). */
function isNonBlankString(value: string | null | undefined): value is string {
  return value !== undefined && value !== null && value.trim().length > 0
}

/** True when the response is an HTML page rather than JSON. */
function isHtmlResponse(response: Response): boolean {
  return response.headers.get('content-type')?.toLowerCase().includes('text/html') ?? false
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}
