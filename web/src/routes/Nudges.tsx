import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Input, Loading, PageHeader } from '../components/ui'
import { ago } from '../lib/format'
import { NUDGES, type Nudge, type NudgeKind } from '../lib/types'

export default function Nudges() {
  const { userId, coupleId, summary, refresh } = useSession()
  const [history, setHistory] = useState<Nudge[]>([])
  const [note, setNote] = useState('')
  const [sending, setSending] = useState<NudgeKind | null>(null)
  const [justSent, setJustSent] = useState<NudgeKind | null>(null)
  const [selectedKind, setSelectedKind] = useState<NudgeKind>('miss_you')

  const selected = NUDGES.find((n) => n.kind === selectedKind) ?? NUDGES[0]
  const sent = justSent === selectedKind
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('nudges')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(40)
    if (qErr) setError(errorMessage(qErr))
    else setHistory((data as Nudge[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!coupleId) return
    const channel = supabase
      .channel(`nudge-history:${coupleId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'nudges', filter: `couple_id=eq.${coupleId}` },
        () => void load(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, load])

  async function send(kind: NudgeKind) {
    setSending(kind)
    setError('')
    const { error: rpcError } = await supabase.rpc('send_nudge', {
      nudge_kind: kind,
      note: note.trim() || null,
    })
    setSending(null)
    if (rpcError) return setError(errorMessage(rpcError))

    setNote('')
    setJustSent(kind)
    setTimeout(() => setJustSent(null), 2200)
    await load()
    await supabase.rpc('sync_achievements')
    await refresh()
  }

  const partnerName = summary?.partner?.display_name ?? 'them'

  if (loading) return <Loading label="…" />

  return (
    <>
      <PageHeader eyebrow="One tap" title="Say it without saying it">
        Press one. It lands on their phone in about a second.
      </PageHeader>

      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      {/* Pick below, it loads up here, then send. The big card is the one you
          actually fire, so nothing gets sent by a stray tap on a small icon. */}
      <button
        onClick={() => void send(selected.kind)}
        disabled={sending !== null}
        className="mb-4 grid w-full place-items-center gap-2 rounded-3xl border border-pink-500/40 bg-gradient-to-br from-rose-900/70 to-rose-950 py-12 shadow-2xl transition-transform active:scale-[0.985] disabled:opacity-60"
      >
        {/* keyed on the selection so it re-mounts and replays the animation */}
        <span
          key={sent ? 'sent' : selected.kind}
          className="animate-unseal text-6xl"
        >
          {sent ? '💌' : selected.emoji}
        </span>

        <span key={`${selected.kind}-label`} className="animate-rise text-3xl font-bold text-white">
          {sent ? 'Sent.' : selected.label}
        </span>

        <span className="text-xs text-rose-300">
          {sent
            ? `${partnerName} will know in a second`
            : note.trim()
              ? `with "${note.trim()}" — tap to send`
              : 'tap to send'}
        </span>
      </button>

      <div className="mb-5 grid grid-cols-3 gap-3">
        {NUDGES.map((n) => {
          const active = n.kind === selected.kind
          return (
            <button
              key={n.kind}
              onClick={() => setSelectedKind(n.kind)}
              disabled={sending !== null}
              className={cx(
                'group grid place-items-center gap-2 rounded-2xl border py-5 transition-all disabled:opacity-60',
                active
                  ? 'scale-105 border-pink-500/60 bg-pink-500/15'
                  : 'border-rose-700/40 bg-rose-900/30 hover:-translate-y-0.5 hover:bg-rose-900/50',
              )}
            >
              <span
                className={cx(
                  'grid size-12 place-items-center rounded-full text-2xl transition-transform',
                  active
                    ? 'bg-pink-500/25 scale-110'
                    : 'bg-rose-950/60 group-hover:rotate-[-6deg]',
                )}
              >
                {n.emoji}
              </span>
              <span
                className={cx(
                  'px-1 text-center text-[11px] leading-tight',
                  active ? 'font-semibold text-pink-200' : 'text-rose-300',
                )}
              >
                {n.label}
              </span>
            </button>
          )
        })}
      </div>

      <div className="mb-8">
        <Input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Add a few words to the next one… (optional)"
          maxLength={140}
        />
      </div>

      <section className="space-y-3">
        <h2 className="label">Lately</h2>
        {history.length === 0 ? (
          <p className="text-sm text-ink-faint">Nothing yet. Go on, press the big one.</p>
        ) : (
          <ul className="space-y-1.5">
            {history.map((n) => {
              const meta = NUDGES.find((x) => x.kind === n.kind)
              const mine = n.sender_id === userId
              return (
                <li
                  key={n.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-surface/40"
                >
                  <span className="text-lg">{meta?.emoji}</span>
                  <span className="min-w-0 flex-1 truncate text-rose-300">
                    {mine ? (
                      <span className="text-rose-200">
                        {meta?.mine(partnerName) ?? `You nudged ${partnerName}`}
                      </span>
                    ) : (
                      <>
                        <span className="text-white">{partnerName}</span>{' '}
                        <span>{meta?.sent}</span>
                      </>
                    )}
                    {n.message && <span className="text-rose-400"> — “{n.message}”</span>}
                  </span>
                  <span className="shrink-0 text-xs text-ink-faint">{ago(n.created_at)}</span>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
