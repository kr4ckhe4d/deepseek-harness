/**
 * SearXNG-backed `WebSearchProvider` plugin. It contributes to the `ctx.web`
 * registry without owning the service. The provider needs no credentials —
 * SearXNG is a self-hosted metasearch instance — so availability is a base-URL
 * check and the only knob is where the instance lives.
 *
 * @module @deepseek-ai/dsh-web-search-searxng
 */

import type { Context } from '@deepseek-ai/cordis'
import { launchEnvironmentOf } from '@deepseek-ai/dsh-launch-environment'
import z from '@deepseek-ai/schemastery'
import type {} from '@deepseek-ai/dsh-web'
import {
  SearxngSearchProvider,
  SEARXNG_DEFAULT_BASE_URL,
} from './provider.ts'

export {
  SEARXNG_DEFAULT_BASE_URL,
  SEARXNG_PROVIDER_ID,
  SearxngSearchProvider,
} from './provider.ts'
export type { SearxngSearchProviderOptions } from './provider.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'web-search-searxng'

/** The web seam this provider registers into. */
export const inject = ['web']

/** Environment variable naming this provider's instance base URL. */
export const SEARXNG_BASE_URL_ENV = 'SEARXNG_BASE_URL'

/** Plugin config (all optional — `apply` fills env-var and constant defaults). */
export interface Config {
  /** SearXNG instance base URL; `/search` is appended. Falls back to `$SEARXNG_BASE_URL`. */
  baseURL?: string
  /** SearXNG `categories` value (e.g. `general`, `it`). Omitted = the instance default. */
  categories?: string
  /** SearXNG `language` value (e.g. `en`). Omitted = the instance default. */
  language?: string
}

export const Config: z<Config> = z.object({
  baseURL: z.string(),
  categories: z.string(),
  language: z.string(),
})

/** Register the SearXNG search provider with `ctx.web`. */
export function apply(ctx: Context, config: Config): void {
  const baseURL = config.baseURL
    ?? launchEnvironmentOf(ctx).get(SEARXNG_BASE_URL_ENV)?.value
    ?? SEARXNG_DEFAULT_BASE_URL
  ctx.web.registerSearchProvider(new SearxngSearchProvider({
    baseURL,
    ...config.categories !== undefined && config.categories.length > 0 ? { categories: config.categories } : {},
    ...config.language !== undefined && config.language.length > 0 ? { language: config.language } : {},
  }))
}
