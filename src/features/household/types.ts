// Household — shared finances for two users. Rows mirror the tables in
// supabase/migrations/20261027000001_household.sql. household_members.user_id and
// household_invites.token_hash are not selectable by clients, so they are absent here.

export type HouseholdRole = 'owner' | 'member'
export type MemberStatus = 'active' | 'left' | 'removed'
export type InviteStatus = 'pending' | 'accepted' | 'revoked'
export type HouseholdEntryType = 'income' | 'expense'

export interface Household {
  id: string
  name: string
  status: 'active' | 'archived'
  created_at: string
}

export interface HouseholdMember {
  id: string
  household_id: string
  role: HouseholdRole
  display_name: string
  status: MemberStatus
  joined_at: string
  left_at: string | null
}

export interface HouseholdInvite {
  id: string
  household_id: string
  status: InviteStatus
  created_by_member_id: string
  accepted_by_member_id: string | null
  created_at: string
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

export interface HouseholdCategory {
  id: string
  household_id: string
  name: string
  kind: HouseholdEntryType
  icon: string
  is_archived: boolean
}

export interface HouseholdTransaction {
  id: string
  household_id: string
  type: HouseholdEntryType
  amount: number
  category_id: string | null
  description: string | null
  txn_date: string
  paid_by_member_id: string
  created_by_member_id: string
  updated_by_member_id: string
  created_at: string
  updated_at: string
}

export interface HouseholdBudget {
  id: string
  household_id: string
  /** null = the overall monthly budget */
  category_id: string | null
  monthly_limit: number
  updated_at: string
}

/** mp_household_current(): who the signed-in user is in their household. */
export interface HouseholdMe {
  household_id: string
  member_id: string
  role: HouseholdRole
}

/** mp_household_preview_invite(): metadata only for a usable invite. */
export type InvitePreview =
  | { valid: false }
  | {
      valid: true
      household_name: string
      inviter_display_name: string
      expires_at: string
      already_member: boolean
      in_other_household: boolean
    }

export interface HouseholdEntryInput {
  type: HouseholdEntryType
  amount: number
  category_id: string | null
  description: string | null
  txn_date: string
  paid_by_member_id: string
}
