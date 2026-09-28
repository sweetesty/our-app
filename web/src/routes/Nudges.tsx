import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Field, Input, Loading, Modal, PageHeader } from '../components/ui'
import EmojiPicker from '../components/EmojiPicker'
import { ago } from '../lib/format'
import { NUDGES, type CustomNudge, type Nudge, type NudgeKind } from '../lib/types'
import Emoji from '../components/Emoji'

/**
 * What the big button is currently loaded with: one of the built-in six, or a
 * tile you wrote. They behave identically from here down — the difference is
 * only where the emoji and the words come from.
 */
type Choice = {
  kind: NudgeKind
  emoji: string
  label: string
  /** Only set for custom ones; sent along so the push reads in your words. */
  customId?: string
}

const BUILT_IN: Choice[] = NUDGES.map((n) => ({
  kind: n.kind,
  emoji: n.emoji,
  label: n.label,
}))

export default function Nudges() {
  const { userId, coupleId, summary, refresh } = useSession()
  const [history, setHistory] = useState<Nudge[]>([])
  const [mine, setMine] = useState<CustomNudge[]>([])
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [justSent, setJustSent] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string>('miss_you')
  const [writeOpen, setWriteOpen] = useState(false)

  // One list, built-ins first, so the grid and the picker do not have to know
  // which half a tile came from.
  const choices: Choice[] = [
    ...BUILT_IN,
    ...mine.map((c) => ({
      kind: 'custom' as const,
      emoji: c.emoji,
      label: c.label,
      customId: c.id,
    })),
  ]

  const idOf = (c: Choice) => c.customId ?? c.kind
  const selected = choices.find((c) => idOf(c) === selectedId) ?? choices[0]
  const sent = justSent === selectedId
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const [{ data, error: qErr }, { data: customs }] = await Promise.all([
      supabase.from('nudges').select('*').order('created_at', { ascending: false }).limit(40),
      supabase.from('custom_nudges').select('*').order('created_at'),
    ])
    if (qErr) setError(errorMessage(qErr))
    else setHistory((data as Nudge[]) ?? [])
    setMine((customs as CustomNudge[]) ?? [])
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

  async function send(choice: Choice) {
    setSending(true)
    setError('')

    // The words ride along with every custom send rather than being looked up
    // from the tile later — deleting a tile must not rewrite what you said.
    const { error: rpcError } = await supabase.rpc('send_nudge', {
      nudge_kind: choice.kind,
      note: note.trim() || null,
      emoji: choice.customId ? choice.emoji : null,
      label: choice.customId ? choice.label : null,
    })
    setSending(false)
    if (rpcError) return setError(errorMessage(rpcError))

    setNote('')
    setJustSent(idOf(choice))
    setTimeout(() => setJustSent(null), 2200)
    await load()
    await supabase.rpc('sync_achievements')
    await refresh()
  }

  async function removeCustom(id: string) {
    setMine((current) => current.filter((c) => c.id !== id))
    if (selectedId === id) setSelectedId('miss_you')
    await supabase.from('custom_nudges').delete().eq('id', id)
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
        onClick={() => void send(selected)}
        disabled={sending}
        className="mb-4 grid w-full place-items-center gap-2 rounded-3xl border border-pink-500/40 bg-gradient-to-br from-rose-900/70 to-rose-950 py-12 shadow-2xl transition-transform active:scale-[0.985] disabled:opacity-60"
      >
        {/* keyed on the selection so it re-mounts and replays the animation */}
        <span key={sent ? 'sent' : selectedId} className="animate-unseal">
          <Emoji size={64}>{sent ? '💌' : selected.emoji}</Emoji>
        </span>

        <span key={`${selectedId}-label`} className="animate-rise text-3xl font-bold text-white">
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
        {choices.map((n) => {
          const id = idOf(n)
          const active = id === selectedId
          return (
            <button
              key={id}
              onClick={() => setSelectedId(id)}
              disabled={sending}
              className={cx(
                'group relative grid place-items-center gap-2 rounded-2xl border py-5 transition-all disabled:opacity-60',
                active
                  ? 'scale-105 border-pink-500/60 bg-pink-500/15'
                  : 'border-rose-700/40 bg-rose-900/30 hover:-translate-y-0.5 hover:bg-rose-900/50',
              )}
            >
              <span
                className={cx(
                  'grid size-12 place-items-center rounded-full transition-transform',
                  active
                    ? 'bg-pink-500/25 scale-110'
                    : 'bg-rose-950/60 group-hover:rotate-[-6deg]',
                )}
              >
                <Emoji size={28}>{n.emoji}</Emoji>
              </span>
              <span
                className={cx(
                  'px-1 text-center text-[11px] leading-tight',
                  active ? 'font-semibold text-pink-200' : 'text-rose-300',
                )}
              >
                {n.label}
              </span>

              {/* Yours can go. The six cannot — they are the floor. */}
              {n.customId && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Delete ${n.label}`}
                  onClick={(e) => {
                    e.stopPropagation()
                    void removeCustom(n.customId!)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.stopPropagation()
                      void removeCustom(n.customId!)
                    }
                  }}
                  className="absolute top-1.5 right-2 text-xs text-rose-500 transition-colors hover:text-rose-200"
                >
                  ✕
                </span>
              )}
            </button>
          )
        })}

        {/* Same shape as a nudge, so it sits in the grid rather than above it. */}
        <button
          onClick={() => setWriteOpen(true)}
          className="group grid place-items-center gap-2 rounded-2xl border border-dashed border-rose-700/40 bg-rose-900/15 py-5 transition-all hover:-translate-y-0.5 hover:bg-rose-900/40"
        >
          <Emoji size={26} className="grid size-12 place-items-center rounded-full bg-rose-950/60 text-rose-400 transition-transform group-hover:rotate-[-6deg]">✏️</Emoji>
          <span className="px-1 text-center text-[11px] leading-tight text-rose-400">
            Write your own
          </span>
        </button>
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
              const isMine = n.sender_id === userId
              // A custom one carries its own words; the six look theirs up.
              const emoji = n.kind === 'custom' ? (n.emoji ?? '💌') : meta?.emoji
              const line =
                n.kind === 'custom'
                  ? (n.label ?? 'nudged you')
                  : isMine
                    ? (meta?.mine(partnerName) ?? `You nudged ${partnerName}`)
                    : meta?.sent
              return (
                <li
                  key={n.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm hover:bg-surface/40"
                >
                  <Emoji size={18}>{emoji ?? ''}</Emoji>
                  <span className="min-w-0 flex-1 truncate text-rose-300">
                    {n.kind === 'custom' ? (
                      <>
                        <span className={isMine ? 'text-rose-200' : 'text-white'}>
                          {isMine ? 'You' : partnerName}
                        </span>{' '}
                        <span>— “{line}”</span>
                      </>
                    ) : isMine ? (
                      <span className="text-rose-200">{line}</span>
                    ) : (
                      <>
                        <span className="text-white">{partnerName}</span> <span>{line}</span>
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

      <WriteNudge
        open={writeOpen}
        onClose={() => setWriteOpen(false)}
        coupleId={coupleId}
        userId={userId}
        onSaved={async (id) => {
          setWriteOpen(false)
          await load()
          // Loaded into the big button, ready to send — writing one is nearly
          // always the first half of sending it.
          setSelectedId(id)
        }}
      />
    </>
  )
}

/* -------------------------------------------------------------------------- */

function WriteNudge({
  open,
  onClose,
  coupleId,
  userId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  coupleId: string | null
  userId: string | null
  onSaved: (id: string) => void | Promise<void>
}) {
  const [emoji, setEmoji] = useState('💌')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setEmoji('💌')
    setLabel('')
    setError('')
  }, [open])

  async function save() {
    if (!label.trim() || !coupleId) return
    setBusy(true)
    setError('')

    const { data, error: insertError } = await supabase
      .from('custom_nudges')
      .insert({
        couple_id: coupleId,
        created_by: userId,
        emoji: emoji.trim() || '💌',
        label: label.trim(),
      })
      .select()
      .single()

    setBusy(false)
    if (insertError) return setError(errorMessage(insertError))
    await onSaved((data as CustomNudge).id)
  }

  return (
    <Modal open={open} onClose={onClose} title="Write a nudge" icon="pencil">
      <div className="space-y-4">
        <Field label="What does it say?" hint="It lands on their phone exactly like this.">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Come home"
            maxLength={40}
          />
        </Field>

        <Field label="Emoji">
          <EmojiPicker value={emoji} onPick={setEmoji} />
        </Field>

        {/* What they will actually see, before you commit it to the grid. */}
        <div className="grid place-items-center gap-1 rounded-2xl border border-rose-700/40 bg-rose-950/50 py-5">
          <Emoji size={40}>{emoji || '💌'}</Emoji>
          <span className="text-lg font-bold text-white">{label.trim() || 'Come home'}</span>
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button
          disabled={busy || !label.trim()}
          onClick={() => void save()}
          className="w-full rounded-2xl bg-pink-600 py-3 text-sm font-semibold text-white shadow transition hover:bg-pink-500 disabled:opacity-50"
        >
          {busy ? 'Saving…' : 'Add to the grid'}
        </button>
      </div>
    </Modal>
  )
}
