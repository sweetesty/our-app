import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { ErrorNote, Input, Loading, PageHeader } from '../components/ui'
import { ago } from '../lib/format'
import { NUDGES, type Nudge, type NudgeKind } from '../lib/types'

export default function Nudges() {
  const { userId, coupleId, summary, refresh } = useSession()
  const [history, setHistory] = useState<Nudge[]>([])
  const [note, setNote] = useState('')
  const [sending, setSending] = useState<NudgeKind | null>(null)
  const [justSent, setJustSent] = useState<NudgeKind | null>(null)
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

      {/* The big one gets its own row. */}
      <button
        onClick={() => void send('miss_you')}
        disabled={sending !== null}
        className="paper taped tilt-a mb-3 grid w-full place-items-center gap-2 pt-14 pb-12 shadow-[var(--shadow-bloom)] transition-transform active:scale-[0.985] disabled:opacity-60"
      >
        <span className={justSent === 'miss_you' ? 'text-6xl' : 'animate-pulse-soft text-6xl'}>
          {justSent === 'miss_you' ? '💌' : '🥺'}
        </span>
        <span
          className="font-display text-3xl text-lav-500"
          style={{
            textShadow: '0 2px 0 var(--color-blush-400), 0 -2px 0 var(--color-blush-400), 2px 0 0 var(--color-blush-400), -2px 0 0 var(--color-blush-400)',
          }}
        >
          {justSent === 'miss_you' ? 'Sent.' : 'I miss you'}
        </span>
        <span className="text-xs text-ink-faint">
          {justSent === 'miss_you' ? `${partnerName} will know in a second` : 'tap it'}
        </span>
      </button>

      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
        {NUDGES.filter((n) => n.kind !== 'miss_you').map((n) => (
          <button
            key={n.kind}
            onClick={() => void send(n.kind)}
            disabled={sending !== null}
            className="surface group grid place-items-center gap-2 py-7 transition-transform hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-60"
          >
            <span
              className={
                justSent === n.kind
                  ? 'stamp grid size-14 rotate-[-8deg] place-items-center rounded-full bg-blush-300/60 text-2xl text-blush-600'
                  : 'grid size-14 place-items-center rounded-full bg-sunken text-3xl transition-transform group-hover:rotate-[-6deg]'
              }
            >
              {justSent === n.kind ? '✓' : n.emoji}
            </span>
            <span className="text-xs text-ink-muted">{justSent === n.kind ? 'sent' : n.label}</span>
          </button>
        ))}
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
