import { describe, expect, it } from 'vitest'
import { greetingKeyFor } from '../src/client/skeleton/greeting.ts'

describe('greetingKeyFor', () => {
  it('maps each local-time band to its dictionary keys', () => {
    expect(greetingKeyFor(new Date(2026, 7, 2, 3, 0))).toBe('hero.greet.night.0')
    expect(greetingKeyFor(new Date(2026, 7, 2, 9, 0))).toBe('hero.greet.morning.0')
    expect(greetingKeyFor(new Date(2026, 7, 2, 14, 0))).toBe('hero.greet.afternoon.0')
    expect(greetingKeyFor(new Date(2026, 7, 2, 21, 0))).toBe('hero.greet.evening.0')
  })

  it('alternates the variant by day-of-month parity', () => {
    expect(greetingKeyFor(new Date(2026, 7, 2, 9, 0))).toBe('hero.greet.morning.0')
    expect(greetingKeyFor(new Date(2026, 7, 3, 9, 0))).toBe('hero.greet.morning.1')
  })

  it('covers the band boundaries', () => {
    expect(greetingKeyFor(new Date(2026, 7, 2, 0, 0))).toBe('hero.greet.night.0')
    expect(greetingKeyFor(new Date(2026, 7, 2, 5, 0))).toBe('hero.greet.morning.0')
    expect(greetingKeyFor(new Date(2026, 7, 2, 12, 0))).toBe('hero.greet.afternoon.0')
    expect(greetingKeyFor(new Date(2026, 7, 2, 18, 0))).toBe('hero.greet.evening.0')
    expect(greetingKeyFor(new Date(2026, 7, 2, 23, 59))).toBe('hero.greet.evening.0')
  })
})
