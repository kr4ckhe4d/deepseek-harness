/**
 * Personalized hero greeting selection. Pure: the pick depends only on the
 * given date, so the greeting is stable for a day within one time-of-day
 * band and the choice is unit-testable.
 */
import type { ConversationKey } from '../locales.ts'

/** Two rotating greeting keys per time-of-day band. */
const BANDS: readonly (readonly [ConversationKey, ConversationKey])[] = [
  ['hero.greet.night.0', 'hero.greet.night.1'], // 0:00–4:59
  ['hero.greet.morning.0', 'hero.greet.morning.1'], // 5:00–11:59
  ['hero.greet.afternoon.0', 'hero.greet.afternoon.1'], // 12:00–17:59
  ['hero.greet.evening.0', 'hero.greet.evening.1'], // 18:00–23:59
]

/**
 * Pick the greeting key for a moment: the local-time band, alternated by
 * day-of-month parity so consecutive days read differently.
 * @param date - the moment to greet at (local time).
 * @returns the conversation-namespace dictionary key of the greeting template.
 */
export function greetingKeyFor(date: Date): ConversationKey {
  const hour = date.getHours()
  const band = hour < 5 ? 0 : hour < 12 ? 1 : hour < 18 ? 2 : 3
  const variants = BANDS[band] as readonly [ConversationKey, ConversationKey]
  return date.getDate() % 2 === 0 ? variants[0] : variants[1]
}
