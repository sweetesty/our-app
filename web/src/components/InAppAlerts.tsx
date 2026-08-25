import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { MOODS, NUDGES, type LoveNote, type Nudge } from '../lib/types'

type Alert = {
  /** The row id, so the same event can never queue twice. */
  id: string
  emoji: string
  line: string
  detail?: string | null
  path?: string
}

const VISIBLE = 3
const DISMISS_AFTER = 7000

/**
 * Everything your person does, surfaced while the app is open.
 *
 * A push notification is no help here — iOS suppresses it when the app is in
 * the foreground, and you are already looking at the screen. So if you are both
 * mid card game and one of you sends a note, the other saw nothing at all.
 * This replaces the old nudge-only listener with one that covers notes,
 * moments and compliments too.
 *
 * Built on realtime rather than the foreground FCM handler for three reasons:
 * it works for someone who never granted notification permission, it carries
 * the row so a tap can open the right screen, and RLS decides what the other
 * person is allowed to hear about rather than this component.
 */
export default function InAppAlerts() {
  const { summary, userId, coupleId, refresh } = useSession()
  const navigate = useNavigate()
  const [alerts, setAlerts] = useState<Alert[]>([])
  const timers = useRef<number[]>([])

  const name = summary?.partner?.display_name ?? 'They'
  // The subscription must not tear down and rebuild every time the partner's
  // name resolves, so the handler reads through a ref.
  const nameRef = useRef(name)
  nameRef.current = name

  const push = useCallback(
    (alert: Alert) => {
      setAlerts((current) => {
        if (current.some((a) => a.id === alert.id)) return current
        return [...current, alert].slice(-VISIBLE)
      })
      timers.current.push(
        window.setTimeout(
          () => setAlerts((current) => current.filter((a) => a.id !== alert.id)),
          DISMISS_AFTER,
        ),
      )
      // Keeps the unread counts and the icon badge in step, so the toast and
      // the rest of the app never disagree about what has arrived.
      void refresh()
    },
    [refresh],
  )

  useEffect(() => {
    if (!coupleId || !userId) return

    const scope = { schema: 'public', event: 'INSERT' as const, filter: `couple_id=eq.${coupleId}` }

    const channel = supabase
      .channel(`alerts:${coupleId}`)
      .on('postgres_changes', { ...scope, table: 'nudges' }, ({ new: row }) => {
        const nudge = row as Nudge
        if (nudge.sender_id === userId) return
        const meta = NUDGES.find((n) => n.kind === nudge.kind)
        push({
          id: nudge.id,
          emoji: meta?.emoji ?? '❤️',
          line: `${nameRef.current} ${meta?.sent ?? 'is thinking of you'}.`,
          detail: nudge.message,
          path: '/nudges',
        })
        void supabase
          .from('nudges')
          .update({ seen_at: new Date().toISOString() })
          .eq('id', nudge.id)
      })
      .on('postgres_changes', { ...scope, table: 'love_notes' }, ({ new: row }) => {
        const note = row as LoveNote
        if (note.author_id === userId) return
        push({
          id: note.id,
          emoji: MOODS.find((m) => m.value === note.mood)?.emoji ?? '💌',
          line: `${nameRef.current} left you a note.`,
          detail: note.title,
          path: '/notes',
        })
      })
      .on('postgres_changes', { ...scope, table: 'moments' }, ({ new: row }) => {
        const moment = row as { id: string; author_id: string; caption: string | null }
        if (moment.author_id === userId) return
        push({
          id: moment.id,
          emoji: '📸',
          line: `${nameRef.current} sent you a moment.`,
          detail: moment.caption,
          path: '/moments',
        })
      })
      .on('postgres_changes', { ...scope, table: 'compliments' }, ({ new: row }) => {
        const compliment = row as {
          id: string
          author_id: string
          emoji: string
          body: string
        }
        if (compliment.author_id === userId) return
        push({
          id: compliment.id,
          emoji: compliment.emoji || '💕',
          // A compliment is short enough to read in full here, so it does not
          // need a screen to open — the toast is the whole thing.
          line: `${nameRef.current} says…`,
          detail: compliment.body,
        })
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, userId, push])

  useEffect(
    () => () => {
      timers.current.forEach(window.clearTimeout)
      timers.current = []
    },
    [],
  )

  if (alerts.length === 0) return null

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-0 z-[70] flex flex-col items-center gap-2 px-4"
      // Clears the status bar on an installed PWA, where the page runs under it.
      style={{ paddingTop: 'max(1rem, calc(env(safe-area-inset-top) + 0.5rem))' }}
    >
      {alerts.map((alert) => (
        <button
          key={alert.id}
          onClick={() => {
            setAlerts((current) => current.filter((a) => a.id !== alert.id))
            if (alert.path) navigate(alert.path)
          }}
          className="paper animate-rise pointer-events-auto flex w-full max-w-sm items-center gap-3 px-5 py-3.5 text-left shadow-[var(--shadow-bloom)]"
        >
          <span className="shrink-0 text-2xl">{alert.emoji}</span>
          <span className="min-w-0">
            <span className="block text-sm text-ink">{alert.line}</span>
            {alert.detail && (
              <span className="block truncate text-xs text-ink-muted">“{alert.detail}”</span>
            )}
          </span>
        </button>
      ))}
    </div>
  )
}
