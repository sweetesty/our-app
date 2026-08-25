import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { NUDGES, type Nudge } from '../lib/types'

/**
 * Sits at the root and listens for nudges your partner sends. Postgres pushes
 * the insert straight down the realtime socket, so the toast lands roughly when
 * they lift their thumb. Notifications proper live in the Flutter app; on web
 * this is the equivalent.
 */
export default function NudgeListener() {
  const { summary, userId, coupleId } = useSession()
  const [incoming, setIncoming] = useState<Nudge | null>(null)

  useEffect(() => {
    if (!coupleId || !userId) return

    const channel = supabase
      .channel(`nudges:${coupleId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'nudges',
          filter: `couple_id=eq.${coupleId}`,
        },
        (payload) => {
          const nudge = payload.new as Nudge
          if (nudge.sender_id === userId) return // your own tap, ignore
          setIncoming(nudge)
          void supabase
            .from('nudges')
            .update({ seen_at: new Date().toISOString() })
            .eq('id', nudge.id)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, userId])

  useEffect(() => {
    if (!incoming) return
    const timer = setTimeout(() => setIncoming(null), 6000)
    return () => clearTimeout(timer)
  }, [incoming])

  if (!incoming) return null

  const meta = NUDGES.find((n) => n.kind === incoming.kind)
  const name = summary?.partner?.display_name ?? 'They'

  return (
    <div
      role="status"
      aria-live="polite"
      className="animate-rise fixed inset-x-0 top-4 z-50 mx-auto w-fit max-w-[calc(100%-2rem)] px-4"
    >
      <button
        onClick={() => setIncoming(null)}
        className="paper flex items-center gap-3 px-5 py-3.5 text-left shadow-[var(--shadow-bloom)]"
      >
        <span className="text-2xl">{meta?.emoji ?? '❤️'}</span>
        <span className="min-w-0">
          <span className="block text-sm text-ink">
            {name} {meta?.sent ?? 'is thinking of you'}.
          </span>
          {incoming.message && (
            <span className="block truncate text-xs text-ink-muted">“{incoming.message}”</span>
          )}
        </span>
      </button>
    </div>
  )
}
