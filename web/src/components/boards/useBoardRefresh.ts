import { useEffect } from 'react'

/**
 * Re-read the board whenever you come back to it.
 *
 * Realtime is the fast path, not the only one. A phone that was asleep, a tab
 * left in the background, a websocket the OS quietly closed while you were in
 * another app — in any of those the move your partner made never arrives, and
 * the board sits there showing a position that stopped being true an hour ago.
 *
 * Tapping a turn notification lands you in exactly that state: the push woke
 * the phone, but the socket that would have carried the move had already gone.
 * Which is why the only way to see your turn was to leave the game and come
 * back — a remount refetches, and nothing else did.
 *
 * So: refetch on becoming visible, and on window focus. Cheap, and it makes
 * the socket an optimisation rather than a dependency.
 */
export function useBoardRefresh(load: () => void | Promise<void>) {
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') void load()
    }

    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)

    return () => {
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [load])
}
