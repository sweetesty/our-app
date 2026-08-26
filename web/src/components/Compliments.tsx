import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { celebrateReveal } from '../lib/celebrate'
import { ago } from '../lib/format'
import Reactions, { type ReactionRow } from './Reactions'
import { cx, Modal } from './ui'

type Compliment = {
  id: string
  author_id: string
  kind: string
  emoji: string
  body: string
  seen_at: string | null
  created_at: string
}

const PRESETS = [
  { kind: 'adorable', emoji: '🥰', body: "You're adorable" },
  { kind: 'look_good', emoji: '😍', body: 'You look so good' },
  { kind: 'proud', emoji: '💕', body: "I'm proud of you" },
  { kind: 'happy', emoji: '🫶', body: 'You make me happy' },
  { kind: 'amazing', emoji: '✨', body: "You're amazing" },
  { kind: 'miss', emoji: '🥹', body: 'I miss you' },
  { kind: 'fine', emoji: '🔥', body: "You're so fine" },
  { kind: 'appreciate', emoji: '💗', body: 'I appreciate you' },
  { kind: 'favourite', emoji: '🌹', body: "You're my favourite person" },
] as const

/**
 * Compliments.
 *
 * Separate from nudges on purpose: a nudge says how *you* feel ("I miss you"),
 * a compliment is about *them*. They are the sentences people think constantly
 * and say almost never, so the whole design is about removing the friction —
 * two taps, no typing required.
 */
export default function Compliments({
  open: controlledOpen,
  onClose,
  hideTrigger = false,
  view = 'send',
}: {
  /** Controlled mode: opened from a moment card rather than its own button. */
  open?: boolean
  onClose?: () => void
  hideTrigger?: boolean
  /** Which half opens — the picker, or everything already said. */
  view?: 'send' | 'history'
} = {}) {
  const { userId, summary, refresh } = useSession()
  const [selfOpen, setSelfOpen] = useState(false)

  const open = controlledOpen ?? selfOpen
  const setOpen = (v: boolean) => {
    if (controlledOpen === undefined) setSelfOpen(v)
    else if (!v) onClose?.()
  }
  const [history, setHistory] = useState<Compliment[]>([])
  const [reactions, setReactions] = useState<Record<string, ReactionRow[]>>({})
  const [custom, setCustom] = useState('')
  const [writing, setWriting] = useState(false)
  const [sending, setSending] = useState<string | null>(null)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [showHistory, setShowHistory] = useState(false)

  const load = useCallback(async () => {
    const [{ data: rows }, { data: reacts }] = await Promise.all([
      supabase
        .from('compliments')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50),
      supabase
        .from('reactions')
        .select('target_id, emoji, user_id')
        .eq('target_kind', 'compliment'),
    ])

    setHistory((rows as Compliment[]) ?? [])

    const grouped: Record<string, ReactionRow[]> = {}
    for (const r of (reacts as { target_id: string; emoji: string; user_id: string }[]) ?? []) {
      ;(grouped[r.target_id] ??= []).push({ emoji: r.emoji, mine: r.user_id === userId })
    }
    setReactions(grouped)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  const unread = history.filter((c) => c.author_id !== userId && !c.seen_at).length

  async function send(kind: string, body: string, emoji: string) {
    setSending(kind)
    setError('')

    const { error: rpcError } = await supabase.rpc('send_compliment', {
      compliment_kind: kind,
      compliment_body: body,
      compliment_emoji: emoji,
    })

    setSending(null)

    if (rpcError) {
      setError(errorMessage(rpcError))
      return
    }

    setSent(true)
    celebrateReveal(null)
    setCustom('')
    setWriting(false)

    setTimeout(() => {
      setSent(false)
      setOpen(false)
    }, 1400)

    await load()
    await refresh()
  }

  const openHistory = useCallback(async () => {
    setShowHistory(true)
    if (history.some((c) => c.author_id !== userId && !c.seen_at)) {
      await supabase.rpc('mark_compliments_seen')
      await load()
      await refresh()
    }
  }, [history, userId, load, refresh])

  // Opened straight onto the history from a moment card.
  useEffect(() => {
    if (open && view === 'history') void openHistory()
    // openHistory changes as the list loads; only the opening matters here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, view])

  function closeHistory() {
    setShowHistory(false)
    if (view === 'history') setOpen(false)
  }

  const partnerName = summary?.partner?.display_name ?? 'them'

  return (
    <>
      {!hideTrigger && (
        <div className="flex gap-2">
          <button
            onClick={() => setOpen(true)}
            className="flex-1 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3.5 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 hover:to-rose-500 active:scale-[0.98]"
          >
            Send a Compliment 💕
          </button>

          <button
            onClick={() => void openHistory()}
            className="relative rounded-2xl border border-rose-700/40 bg-rose-900/40 px-4 text-sm text-rose-200 transition hover:bg-rose-900"
          >
            💌
            {unread > 0 && (
              <span className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-pink-500 text-[10px] font-bold text-white">
                {unread}
              </span>
            )}
          </button>
        </div>
      )}

      {/* picker */}
      <Modal
        open={open && view === 'send'}
        onClose={() => setOpen(false)}
        title={`Tell ${partnerName} 💕`}
      >
        {sent ? (
          <div className="py-10 text-center">
            <p className="animate-unseal text-5xl">💗</p>
            <p className="mt-3 text-sm font-semibold text-white">Sent</p>
            <p className="mt-1 text-xs text-rose-300">
              It's on their phone already.
            </p>
            <button
              onClick={() => {
                setSent(false)
                setOpen(false)
                void openHistory()
              }}
              className="mt-4 text-xs text-pink-300 underline underline-offset-4"
            >
              See it 💌
            </button>
          </div>
        ) : writing ? (
          <div className="space-y-3">
            <textarea
              autoFocus
              rows={3}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              maxLength={200}
              placeholder="Say it in your own words…"
              className="w-full resize-none rounded-2xl border border-rose-700/40 bg-rose-950/50 p-4 text-sm text-rose-100 placeholder-rose-400/50 focus:border-pink-500 focus:outline-none"
            />
            {error && <p className="text-xs text-rose-400">{error}</p>}
            <div className="flex gap-2">
              <button
                onClick={() => setWriting(false)}
                className="rounded-2xl bg-rose-900/60 px-4 py-3 text-sm font-semibold text-rose-200"
              >
                Back
              </button>
              <button
                onClick={() => void send('custom', custom, '💕')}
                disabled={!custom.trim() || sending !== null}
                className="flex-1 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white disabled:opacity-50"
              >
                Send it 💕
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {PRESETS.map((p) => (
              <button
                key={p.kind}
                onClick={() => void send(p.kind, p.body, p.emoji)}
                disabled={sending !== null}
                className={cx(
                  'flex w-full items-center gap-3 rounded-2xl border border-rose-700/40 bg-rose-900/30 p-3.5 text-left transition hover:border-pink-500/50 hover:bg-rose-900/60 disabled:opacity-50',
                  sending === p.kind && 'scale-[0.98] opacity-60',
                )}
              >
                <span className="text-2xl">{p.emoji}</span>
                <span className="text-sm text-rose-100">{p.body}</span>
              </button>
            ))}

            <button
              onClick={() => setWriting(true)}
              className="flex w-full items-center gap-3 rounded-2xl border border-dashed border-rose-700/50 p-3.5 text-left transition hover:border-pink-500/50"
            >
              <span className="text-2xl">✍️</span>
              <span className="text-sm text-rose-200">Write my own</span>
            </button>

            {/* The way back to what has already been said. It used to live only
                beside the trigger button — which is hidden when this opens from
                a photo, so a compliment sent from there went somewhere you
                could not follow it. */}
            {history.length > 0 && (
              <button
                onClick={() => {
                  setOpen(false)
                  void openHistory()
                }}
                className="flex w-full items-center justify-center gap-2 pt-2 text-xs text-rose-300 transition hover:text-rose-100"
              >
                💌 Everything said so far
                <span className="text-rose-500">({history.length})</span>
                {unread > 0 && (
                  <span className="grid size-4 place-items-center rounded-full bg-pink-500 text-[9px] font-bold text-white">
                    {unread}
                  </span>
                )}
              </button>
            )}

            {error && <p className="text-xs text-rose-400">{error}</p>}
          </div>
        )}
      </Modal>

      {/* history */}
      <Modal open={showHistory} onClose={closeHistory} title="Kind words 💌">
        {history.length === 0 ? (
          <p className="py-6 text-center text-sm text-rose-300">
            Nothing yet. Go on — say the thing.
          </p>
        ) : (
          <div className="space-y-3">
            {history.map((c) => {
              const mine = c.author_id === userId
              return (
                <div
                  key={c.id}
                  className={cx(
                    'rounded-2xl border p-4',
                    mine
                      ? 'border-rose-700/40 bg-rose-900/30'
                      : 'border-pink-500/30 bg-pink-500/10',
                  )}
                >
                  <div className="flex items-start gap-3">
                    <span className="text-xl">{c.emoji}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-rose-100">{c.body}</p>
                      <p className="mt-1 text-xs text-rose-400">
                        {mine ? 'You said this' : `${partnerName} said this`} · {ago(c.created_at)}
                      </p>
                      {!mine && (
                        <div className="mt-2">
                          <Reactions
                            targetKind="compliment"
                            targetId={c.id}
                            reactions={reactions[c.id] ?? []}
                            onChanged={load}
                            compact
                          />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </Modal>
    </>
  )
}
