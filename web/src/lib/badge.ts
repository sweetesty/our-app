/**
 * App icon badge — the little count on the installed icon.
 *
 * As close to a widget as a PWA gets: you glance at your home screen and see
 * there's something waiting without opening anything.
 *
 * Supported on Android and desktop PWAs, and on iOS for installed ones. Where
 * it isn't supported the calls simply don't exist, so everything below is a
 * no-op rather than an error.
 */

type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

export function badgeSupported(): boolean {
  return typeof navigator !== 'undefined' && 'setAppBadge' in navigator
}

/**
 * What's actually waiting for you — notes you haven't read, and letters that
 * have unlocked but not been opened.
 *
 * Deliberately excludes today's unanswered question: that's a standing
 * invitation, not something new arriving, and a badge that never clears is one
 * people learn to ignore.
 */
export function badgeCountFrom(summary: {
  unread_notes?: number
  ready_vault?: number
} | null): number {
  if (!summary) return 0
  return (summary.unread_notes ?? 0) + (summary.ready_vault ?? 0)
}

export async function setBadge(count: number): Promise<void> {
  const nav = navigator as BadgeNavigator
  try {
    if (count > 0) await nav.setAppBadge?.(count)
    else await nav.clearAppBadge?.()
  } catch {
    // Safari throws when the app isn't installed. Nothing to do about it.
  }
}

export async function clearBadge(): Promise<void> {
  await setBadge(0)
}
