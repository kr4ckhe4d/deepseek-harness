/**
 * Date-key helpers for the usage charts. The Host returns local `YYYY-MM-DD`
 * keys; parsing them as UTC midnights keeps day arithmetic and weekday
 * lookups timezone-independent, and the short labels render in the browser's
 * own locale.
 */

/** Parse a `YYYY-MM-DD` local-date key into its UTC-midnight Date. */
function dateOfKey(key: string): Date {
  return new Date(`${key}T00:00:00Z`)
}

/** Locale-aware short month label for one date key. */
export function monthLabel(key: string): string {
  return dateOfKey(key).toLocaleDateString(undefined, { month: 'short' })
}

/** Locale-aware short date label (e.g. `Mar 3`) for one date key. */
export function shortDateLabel(key: string): string {
  return dateOfKey(key).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

/** Local weekday index (0 = Sunday) of one date key. */
export function weekdayOfKey(key: string): number {
  return dateOfKey(key).getUTCDay()
}
