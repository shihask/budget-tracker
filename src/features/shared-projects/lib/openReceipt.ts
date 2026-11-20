/**
 * Open a receipt that needs a signed URL first.
 *
 * iPhone Safari (and other popup blockers) only allow window.open during the tap itself,
 * not after an `await`. So a blank tab is opened synchronously, then pointed at the signed
 * URL once it arrives. If the tab was blocked anyway, the current tab navigates instead.
 * Throws when the link can't be created (the blank tab is closed first).
 */
export async function openReceipt(getUrl: () => Promise<string | null>, win: Window = window): Promise<void> {
  const tab = win.open('', '_blank')
  if (tab) tab.opener = null // the receipt page must not be able to reach back into the app
  const url = await getUrl().catch(() => null)
  if (!url) {
    tab?.close()
    throw new Error("Couldn't open the receipt. Check your connection and try again.")
  }
  if (tab) tab.location.href = url
  else win.location.href = url
}
