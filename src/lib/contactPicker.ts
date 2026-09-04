/** Contact Picker API — one-shot, user-invoked, no sync.
 *
 *  This is NOT contact syncing. The browser shows its own picker, the user
 *  chooses exactly one contact, and we receive only that contact's name and
 *  phone. There is no background access, no address-book read, no bulk import,
 *  and nothing is stored beyond the single master the user then saves.
 *
 *  Support is narrow: Chromium on Android only, in a top-level secure context.
 *  iOS Safari and every desktop browser lack it entirely — so the caller must
 *  hide its affordance when `isContactPickerSupported()` is false rather than
 *  offering a button that silently does nothing. */

interface ContactInfo {
  name?: string[]
  tel?: string[]
}

interface ContactsManager {
  select(properties: string[], options?: { multiple?: boolean }): Promise<ContactInfo[]>
  getProperties(): Promise<string[]>
}

/** `navigator.contacts` is not in TypeScript's DOM lib — it is a Chromium-only
 *  API — so it is declared here rather than globally, keeping the cast local. */
type NavigatorWithContacts = Navigator & { contacts?: ContactsManager }

export function isContactPickerSupported(): boolean {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return false
  return (
    'contacts' in navigator &&
    'ContactsManager' in window &&
    // The API rejects outside a secure context; checking up front means the
    // button never appears somewhere it would only ever throw.
    window.isSecureContext
  )
}

export interface PickedContact {
  name: string | null
  phone: string | null
}

/** Opens the OS contact picker. Resolves to null when the user cancels (the
 *  API returns an empty array) or when anything goes wrong — a cancelled pick
 *  is the common case, not an error, so callers should treat null as "no
 *  change" and never surface it as a failure.
 *
 *  Must be called directly from a user gesture, or Chromium rejects it. */
export async function pickContact(): Promise<PickedContact | null> {
  if (!isContactPickerSupported()) return null
  const contacts = (navigator as NavigatorWithContacts).contacts
  if (!contacts) return null

  try {
    const results = await contacts.select(['name', 'tel'], { multiple: false })
    const first = results?.[0]
    if (!first) return null
    return {
      name: first.name?.find(n => n.trim().length > 0)?.trim() ?? null,
      phone: first.tel?.find(t => t.trim().length > 0)?.trim() ?? null,
    }
  } catch {
    // Includes the user dismissing the sheet and the gesture check failing.
    // Neither is worth an error banner.
    return null
  }
}
