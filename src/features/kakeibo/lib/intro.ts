/** Whether this device has seen the Kakeibo intro story. Per device, like the
 *  app's other one-time tips (mp_*_tip_seen_<uid>). If storage is unavailable
 *  it counts as seen, so the intro never loops on a locked-down browser. */
const SEEN_KEY = (uid: string) => `mp_kakeibo_intro_seen_${uid}`

export function introSeen(uid: string): boolean {
  try { return localStorage.getItem(SEEN_KEY(uid)) === '1' } catch { return true }
}

export function markIntroSeen(uid: string) {
  try { localStorage.setItem(SEEN_KEY(uid), '1') } catch { /* storage unavailable — nothing to remember */ }
}
