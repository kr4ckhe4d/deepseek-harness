import { describe, expect, it } from 'vitest'
import { parseWebUrlLine } from '../src/url-line.ts'

describe('parseWebUrlLine', () => {
  it('extracts the authenticated URL from the readiness line', () => {
    const url = parseWebUrlLine('dsh web: http://127.0.0.1:57537/?token=abc123')
    expect(url?.href).toBe('http://127.0.0.1:57537/?token=abc123')
    expect(url?.origin).toBe('http://127.0.0.1:57537')
  })

  it('accepts the LAN suffix after the URL', () => {
    const url = parseWebUrlLine('dsh web: http://127.0.0.1:3080/?token=t (LAN: http://10.0.0.2:3080)')
    expect(url?.port).toBe('3080')
  })

  it('ignores unrelated log lines', () => {
    expect(parseWebUrlLine('dsh web: opening the default browser; pass --no-open to disable')).toBeUndefined()
    expect(parseWebUrlLine('some other output')).toBeUndefined()
    expect(parseWebUrlLine('')).toBeUndefined()
  })

  it('rejects non-http URL tokens', () => {
    expect(parseWebUrlLine('dsh web: file:///etc/passwd')).toBeUndefined()
    expect(parseWebUrlLine('dsh web: not-a-url')).toBeUndefined()
  })
})
