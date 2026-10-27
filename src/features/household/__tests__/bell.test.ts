import { describe, it, expect } from 'vitest'
import { JOIN_BELL_DAYS, joinBellItems } from '../lib/bell'
import type { HouseholdMember } from '../types'

const member = (id: string, joined_at: string, p: Partial<HouseholdMember> = {}): HouseholdMember =>
  ({ id, household_id: 'h', role: 'member', display_name: id.toUpperCase(), status: 'active', joined_at, left_at: null, ...p })

const NOW = new Date('2026-10-27T12:00:00Z').getTime()
const owner = member('a', '2026-10-20T09:00:00.000000+00:00', { role: 'owner' })
const partner = member('b', '2026-10-27T11:30:00.000000+00:00')

describe('joinBellItems', () => {
  it('tells the member who was already there', () => {
    expect(joinBellItems([owner, partner], 'a', new Set(), NOW)).toEqual([
      { memberId: 'b', name: 'B', joinedAt: partner.joined_at },
    ])
  })
  it('never tells the joiner about themselves or about the earlier member', () => {
    expect(joinBellItems([owner, partner], 'b', new Set(), NOW)).toEqual([])
  })
  it('hides a seen join', () => {
    expect(joinBellItems([owner, partner], 'a', new Set(['b']), NOW)).toEqual([])
  })
  it('hides an old join and a member who has since left', () => {
    const later = NOW + JOIN_BELL_DAYS * 24 * 60 * 60 * 1000
    expect(joinBellItems([owner, partner], 'a', new Set(), later)).toEqual([])
    expect(joinBellItems([owner, { ...partner, status: 'left' }], 'a', new Set(), NOW)).toEqual([])
  })
  it('is empty when I am not in the list', () => {
    expect(joinBellItems([owner, partner], 'zzz', new Set(), NOW)).toEqual([])
  })
})
