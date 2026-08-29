/**
 * Token and number formatting for the usage section. Compact values reuse the
 * shared locale vocabulary (`number.thousand`/`million`/`billion`), so the
 * suffixes stay locale-owned; exact values group digits with the shared
 * group separator.
 */

import type { TranslateNS } from '@deepseek-ai/dsh-client-ui-slots'

/** Translate seat shape shared by the section's components. */
export type UsageTranslate = TranslateNS<'settings.usage'>

/**
 * Compact token count: 517 / 12.2K / 517K / 1.2M / 2.9B.
 * @param value - non-negative token count.
 * @param t - locale seat resolving the shared suffix keys.
 * @returns the compact display string.
 */
export function formatCompact(value: number, t: UsageTranslate): string {
  const scaled = (candidate: number): string =>
    candidate >= 100 ? String(Math.round(candidate)) : String(Math.round(candidate * 10) / 10)
  if (value < 1_000) return String(value)
  if (value < 1_000_000) return t('number.thousand', { value: scaled(value / 1_000) })
  if (value < 1_000_000_000) return t('number.million', { value: scaled(value / 1_000_000) })
  return t('number.billion', { value: scaled(value / 1_000_000_000) })
}

/**
 * Exact integer count with locale-owned digit grouping.
 * @param value - non-negative safe integer count.
 * @param t - locale seat resolving the shared group separator.
 * @returns the grouped display string.
 */
export function formatExact(value: number, t: UsageTranslate): string {
  const digits = String(value)
  const groups: string[] = []
  for (let end = digits.length; end > 0; end -= 3) {
    groups.unshift(digits.slice(Math.max(0, end - 3), end))
  }
  return groups.join(t('number.groupSeparator'))
}

/**
 * Percent share with one decimal, trimming a trailing `.0`.
 * @param share - numerator of the share.
 * @param total - denominator; zero yields `0`.
 * @returns percentage text without a trailing zero decimal.
 */
export function formatPercent(share: number, total: number): string {
  if (total === 0) return '0%'
  const tenths = Math.round(share / total * 1_000)
  const whole = Math.floor(tenths / 10)
  const fraction = tenths % 10
  return fraction === 0 ? `${whole}%` : `${whole}.${fraction}%`
}
