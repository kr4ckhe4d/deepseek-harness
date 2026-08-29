/**
 * Wire types for the SearXNG JSON API (`GET /search?format=json`). Types only —
 * no runtime code. SearXNG returns a flat `results[]` alongside optional
 * `answers`/`corrections`/`infoboxes`/`suggestions` arrays; each result entry
 * carries a URL, optional title, optional snippet text (`content`), and an
 * optional `publishedDate` string.
 *
 * @module @deepseek-ai/dsh-web-search-searxng/types
 */

/** One entry of SearXNG's flat `results[]`. */
export interface SearxngResult {
  /** Target page URL. */
  url?: string | null
  /** Result title; may be null. */
  title?: string | null
  /** Snippet text; null when the upstream engine supplied none. */
  content?: string | null
  /** Publication timestamp as returned by the engine; null for most results. */
  publishedDate?: string | null
}

/** SearXNG's search response envelope. */
export interface SearxngSearchResponse {
  /** Echo of the submitted query. */
  query?: string
  /** Ranked result entries. */
  results?: SearxngResult[]
  /**
   * Optional direct answers and sibling blocks. The seam renders sources, so
   * the provider intentionally ignores these blocks.
   */
  answers?: SearxngAnswer[]
  corrections?: SearxngCorrection[]
  infoboxes?: unknown[]
  suggestions?: string[]
}

/** One of SearXNG's `answers[]` direct-answer blocks. */
export interface SearxngAnswer {
  answer?: string | null
}

/** One of SearXNG's `corrections[]` query-correction blocks. */
export interface SearxngCorrection {
  corrected_query?: string | null
}
