/**
 * Durable user-profile section shared by the Host schema and the browser
 * scope. Other client plugins (the conversation hero greeting) read the same
 * `ui-profile` namespace through their own settings scopes; this module is
 * the namespace's single registration home.
 */
import z from '@deepseek-ai/schemastery'

/** Settings namespace owned by the settings shell plugin. */
export const PROFILE_SETTINGS_NAMESPACE = 'ui-profile'

/** Durable profile section: display identity for greetings and the account row. */
export interface ProfileSettings {
  /** The user's full name; empty when unset. */
  fullName: string
  /** What the assistant and greetings call the user; empty when unset. */
  nickname: string
}

/** Durable profile schema; also the wire envelope browser scopes validate against. */
export const ProfileSettingsSchema: z<ProfileSettings> = z.object({
  fullName: z.string().default(''),
  nickname: z.string().default(''),
})

/**
 * Preferred display name: nickname first, then full name.
 * @param profile - the accepted profile section, or undefined before load.
 * @returns the trimmed name, or undefined when neither field is set.
 */
export function displayNameOf(profile: ProfileSettings | undefined): string | undefined {
  if (profile === undefined) return undefined
  const nickname = profile.nickname.trim()
  if (nickname !== '') return nickname
  const fullName = profile.fullName.trim()
  return fullName !== '' ? fullName : undefined
}

/**
 * Up-to-two-letter initials for the avatar chip.
 * @param name - a non-empty display name.
 * @returns the uppercased initials of the first two words.
 */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(word => word !== '')
  return words.slice(0, 2)
    .map(word => String.fromCodePoint(word.codePointAt(0) ?? 0x20))
    .join('')
    .toUpperCase()
    .trim()
}
