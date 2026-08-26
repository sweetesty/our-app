/**
 * Taking down the boot screen in index.html.
 *
 * Called when the session check finishes rather than when React mounts. Those
 * are a moment apart, and it is the wrong moment: React can mount while the
 * app still has no idea whether anyone is signed in, so lifting the splash
 * there shows a frame of nothing and then the real screen snapping in.
 *
 * Safe to call more than once, and safe to call when the markup is not there —
 * a second tab, a test, or an index.html that has moved on.
 */
export function dismissBoot() {
  const root = document.documentElement
  if (root.hasAttribute('data-booted')) return

  root.setAttribute('data-booted', '')

  // Let the fade finish, then take the node out entirely so it can never
  // catch a tap or trap focus.
  window.setTimeout(() => document.getElementById('boot')?.remove(), 700)
}
