import { describe, expect, it } from 'vitest'
import { displayNameOf, initialsOf, ProfileSettingsSchema } from '../src/profile-settings.ts'

describe('displayNameOf', () => {
  it('prefers the nickname over the full name', () => {
    expect(displayNameOf({ fullName: 'Nipuna Herath', nickname: 'Nipuna' })).toBe('Nipuna')
  })

  it('falls back to the full name, trimming whitespace', () => {
    expect(displayNameOf({ fullName: '  Nipuna Herath ', nickname: '   ' })).toBe('Nipuna Herath')
  })

  it('is undefined before load and when both fields are empty', () => {
    expect(displayNameOf(undefined)).toBeUndefined()
    expect(displayNameOf({ fullName: '', nickname: '' })).toBeUndefined()
  })
})

describe('initialsOf', () => {
  it('takes the first letters of up to two words, uppercased', () => {
    expect(initialsOf('Nipuna Herath')).toBe('NH')
    expect(initialsOf('nipuna')).toBe('N')
    expect(initialsOf('Ada Lovelace King')).toBe('AL')
  })

  it('handles surrogate-pair leading characters without splitting them', () => {
    expect(initialsOf('𝔘nicode User')).toBe('𝔘U')
  })
})

describe('ProfileSettingsSchema', () => {
  it('defaults both fields to the empty string', () => {
    const validate = ProfileSettingsSchema as unknown as (value: unknown) => unknown
    expect(validate({})).toEqual({ fullName: '', nickname: '' })
  })
})
