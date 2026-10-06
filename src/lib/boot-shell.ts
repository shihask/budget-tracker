// index.html paints a boot shell (#mp-boot) before the bundle arrives: the
// landing hero for a first-time visitor, a plain spinner for everyone else.
// It overlays #root, so the app must remove it once its first real screen is
// up, and on any path that could otherwise leave it covering the page.

export function dismissBootShell() {
  (window as Window & { __mpBootDone?: () => void }).__mpBootDone?.()
}
