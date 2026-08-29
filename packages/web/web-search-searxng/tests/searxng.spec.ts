import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import WebRuntime from '@deepseek-ai/dsh-web'
import { SearxngSearchProvider, SEARXNG_PROVIDER_ID } from '@deepseek-ai/dsh-web-search-searxng'
import * as searxngPlugin from '@deepseek-ai/dsh-web-search-searxng'
import { mapSearxngResponse, mapSearxngResult } from '../src/provider.ts'

const options = { baseURL: 'http://searxng.test:8080' }

function jsonResponse(body: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' }, ...init })
}

function htmlResponse(body: string, init: ResponseInit = {}): Response {
  return new Response(body, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, ...init })
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('SearXNG result mapping', () => {
  it('maps a full result entry', () => {
    expect(mapSearxngResult({
      url: 'https://a.test',
      title: 'A',
      content: 'salient sentence',
      publishedDate: '2026-01-01',
    })).toEqual({ url: 'https://a.test', title: 'A', snippet: 'salient sentence', publishedAt: '2026-01-01' })
  })

  it('keeps a result without snippet or date, omitting the optional fields', () => {
    expect(mapSearxngResult({ url: 'https://a.test' })).toEqual({ url: 'https://a.test' })
    expect(mapSearxngResult({ url: 'https://a.test', title: 'A', content: null, publishedDate: null }))
      .toEqual({ url: 'https://a.test', title: 'A' })
    expect(mapSearxngResult({ url: 'https://a.test', title: 'A', content: '  ', publishedDate: '' }))
      .toEqual({ url: 'https://a.test', title: 'A' })
  })

  it('drops a result without a URL', () => {
    expect(mapSearxngResult({ title: 'no url' })).toBeUndefined()
    expect(mapSearxngResult({ url: '' })).toBeUndefined()
    expect(mapSearxngResult({ url: null })).toBeUndefined()
  })

  it('maps a response to a result with no content and filtered sources', () => {
    const result = mapSearxngResponse({
      query: 'q',
      results: [
        { url: 'https://a.test', content: 'one' },
        { title: 'no url' },
        { url: 'https://c.test', title: 'C' },
      ],
    })
    expect(result).toEqual({
      sources: [
        { url: 'https://a.test', snippet: 'one' },
        { url: 'https://c.test', title: 'C' },
      ],
      truncated: false,
    })
    expect(result.content).toBeUndefined()
  })

  it('tolerates a missing results array', () => {
    expect(mapSearxngResponse({}).sources).toEqual([])
  })
})

describe('SearxngSearchProvider availability', () => {
  it('is available with a parseable base URL', () => {
    expect(new SearxngSearchProvider(options).available()).toBe(true)
  })

  it('is misconfigured when the base URL is unparseable', () => {
    expect(new SearxngSearchProvider({ ...options, baseURL: 'not a url' }).available()).toBe(false)
  })

  it('is misconfigured when an optional value is the empty string', () => {
    expect(new SearxngSearchProvider({ ...options, categories: '' }).available()).toBe(false)
    expect(new SearxngSearchProvider({ ...options, language: '' }).available()).toBe(false)
  })
})

describe('SearxngSearchProvider request mapping', () => {
  it('sends q, format=json, and no auth header', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: [{ url: 'https://a.test', content: 'hi' }] }))
    vi.stubGlobal('fetch', fetchMock)

    await new SearxngSearchProvider(options).search({ query: 'hello world' })

    expect(fetchMock).toHaveBeenCalledOnce()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('http://searxng.test:8080/search?q=hello+world&format=json')
    expect(init).toMatchObject({ method: 'GET', redirect: 'error' })
    expect((init.headers as Record<string, string>)['accept']).toBe('application/json')
    expect(init.headers).not.toHaveProperty('authorization')
  })

  it('threads categories and language into the query string when configured', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await new SearxngSearchProvider({ ...options, categories: 'it', language: 'en' }).search({ query: 'q' })
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toBe('http://searxng.test:8080/search?q=q&format=json&categories=it&language=en')
  })

  it('omits categories and language when unset', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: [] }))
    vi.stubGlobal('fetch', fetchMock)
    await new SearxngSearchProvider(options).search({ query: 'q' })
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toBe('http://searxng.test:8080/search?q=q&format=json')
  })

  it('forwards the abort signal', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const controller = new AbortController()
    await new SearxngSearchProvider(options).search({ query: 'q' }, controller.signal)
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(init.signal).toBe(controller.signal)
  })
})

describe('SearxngSearchProvider error handling', () => {
  it('maps a rate-limited HTML response to WEB_PROVIDER_ERROR with a limiter hint', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('rate limited', { status: 429 })))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: expect.stringContaining('rate-limited') }))
  })

  it('hints at search.formats for a 403 HTML response', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('forbidden', { status: 403 })))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({
        code: 'WEB_PROVIDER_ERROR',
        message: expect.stringContaining('search.formats'),
      }))
  })

  it('keeps a plain status message for a non-HTML error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('gateway down', { status: 502 })))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: 'SearXNG API error (HTTP 502)' }))
  })

  it('maps a 200 HTML page (json format disabled) to WEB_PROVIDER_ERROR with the fix', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => htmlResponse('format not allowed')))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({
        code: 'WEB_PROVIDER_ERROR',
        message: expect.stringContaining('search.formats'),
      }))
  })

  it('maps a network failure to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new TypeError('connection refused'))))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps an abort to WEB_ABORTED', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new DOMException('aborted', 'AbortError'))))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('maps an unparseable success body to WEB_PROVIDER_ERROR', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse(undefined)))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('maps a well-formed body of the wrong shape to WEB_PROVIDER_ERROR, not a raw TypeError', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ results: {} })))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR' }))
  })

  it('surfaces an abort during success-body parse as WEB_ABORTED, not provider error', async () => {
    const body = { json: () => Promise.reject(new DOMException('aborted', 'AbortError')), ok: true, status: 200, headers: new Headers() }
    vi.stubGlobal('fetch', vi.fn(async () => body as unknown as Response))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_ABORTED' }))
  })

  it('keeps an HTTP error status verbatim without parsing an error body', async () => {
    // SearXNG error answers are HTML pages, not JSON; the provider reports the
    // status (plus a hint for HTML bodies) and never parses the error body.
    const body = { json: () => { throw new Error('must not be called') }, ok: false, status: 500, headers: new Headers({ 'content-type': 'text/html' }) }
    vi.stubGlobal('fetch', vi.fn(async () => body as unknown as Response))
    await expect(new SearxngSearchProvider(options).search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_ERROR', message: expect.stringContaining('HTTP 500') }))
  })
})

describe('web-search-searxng plugin registration', () => {
  it('registers the provider into ctx.web (HMR-safe)', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => jsonResponse({ results: [] })))
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: SEARXNG_PROVIDER_ID })
    const fiber = await ctx.plugin(searxngPlugin, { baseURL: 'http://searxng.test:8080' })
    await expect(ctx.web.search({ query: 'q' })).resolves.toMatchObject({ sources: [], truncated: false })
    await fiber.dispose()
    await expect(ctx.web.search({ query: 'q' }))
      .rejects.toThrow(expect.objectContaining({ code: 'WEB_PROVIDER_CONFIGURED_MISSING' }))
  })

  it('has no default export (namespace plugin export shape)', () => {
    expect('default' in searxngPlugin).toBe(false)
  })

  it('falls back to $SEARXNG_BASE_URL and the default base URL when config omits them', async () => {
    const prev = process.env.SEARXNG_BASE_URL
    process.env.SEARXNG_BASE_URL = 'http://from-env.test:8080'
    try {
      const fetchMock = vi.fn(async () => jsonResponse({ results: [] }))
      vi.stubGlobal('fetch', fetchMock)
      const ctx = new Context()
      await ctx.plugin(WebRuntime, { searchProvider: SEARXNG_PROVIDER_ID })
      const fiber = await ctx.plugin(searxngPlugin, {})
      await ctx.web.search({ query: 'q' })
      const [url] = fetchMock.mock.calls[0] as unknown as [string]
      expect(url).toBe('http://from-env.test:8080/search?q=q&format=json')
      await fiber.dispose()
    } finally {
      if (prev === undefined) delete process.env.SEARXNG_BASE_URL
      else process.env.SEARXNG_BASE_URL = prev
    }
  })

  it('threads categories and language config into the request', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ results: [] }))
    vi.stubGlobal('fetch', fetchMock)
    const ctx = new Context()
    await ctx.plugin(WebRuntime, { searchProvider: SEARXNG_PROVIDER_ID })
    const fiber = await ctx.plugin(searxngPlugin, { baseURL: 'http://searxng.test:8080', categories: 'general', language: 'en' })
    await ctx.web.search({ query: 'q' })
    const [url] = fetchMock.mock.calls[0] as unknown as [string]
    expect(url).toBe('http://searxng.test:8080/search?q=q&format=json&categories=general&language=en')
    await fiber.dispose()
  })
})
