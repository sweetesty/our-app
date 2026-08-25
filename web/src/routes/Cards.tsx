import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Field, Input, Loading, Modal, Textarea } from '../components/ui'
import type { Card, CardDeck } from '../lib/types'

export default function Cards() {
  const { coupleId, refresh } = useSession()
  const [decks, setDecks] = useState<CardDeck[]>([])
  const [active, setActive] = useState<CardDeck | null>(null)
  const [card, setCard] = useState<Card | null>(null)
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(true)
  const [drawing, setDrawing] = useState(false)
  const [error, setError] = useState('')
  const [exhausted, setExhausted] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [played, setPlayed] = useState(0)
  const [newCardOpen, setNewCardOpen] = useState(false)
  const [newDeckOpen, setNewDeckOpen] = useState(false)

  const loadDecks = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('card_decks')
      .select('*')
      .order('sort_order')

    if (qErr) {
      setError(errorMessage(qErr))
      setLoading(false)
      return
    }

    const rows = (data as CardDeck[]) ?? []
    setDecks(rows)
    setLoading(false)
    return rows
  }, [])

  useEffect(() => {
    void loadDecks().then((rows) => {
      if (rows && rows.length > 0) void draw(rows[0])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDecks])

  // Deal face-down, then turn it — the pause is what makes it feel dealt.
  useEffect(() => {
    if (!card) return
    setFlipped(false)
    const timer = setTimeout(() => setFlipped(true), 160)
    return () => clearTimeout(timer)
  }, [card])

  async function draw(deck: CardDeck) {
    setActive(deck)
    setDrawing(true)
    setError('')
    setExhausted(false)
    setCard(null)
    setResponse('')

    const { data, error: rpcError } = await supabase.rpc('draw_card', { target_deck: deck.id })
    setDrawing(false)
    if (rpcError) return setError(errorMessage(rpcError))

    const drawn = (data as Card[])?.[0] ?? null
    if (!drawn) setExhausted(true)
    else setCard(drawn)
  }

  /** Logging the play is what stops the same card coming round again. */
  async function finish(withResponse: boolean) {
    if (!card || !coupleId || !active) return

    const { error: insertError } = await supabase.from('card_plays').insert({
      couple_id: coupleId,
      card_id: card.id,
      played_by: (await supabase.auth.getUser()).data.user!.id,
      response: withResponse ? response.trim() || null : null,
      completed: true,
    })

    if (insertError) return setError(errorMessage(insertError))

    setPlayed((n) => n + 1)
    await supabase.rpc('sync_achievements')
    await refresh()
    await draw(active)
  }

  if (loading) return <Loading label="Shuffling…" />

  return (
    <div className="space-y-4">
      {/* deck filters */}
      <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
        {decks.map((deck) => (
          <button
            key={deck.id}
            onClick={() => void draw(deck)}
            className={cx(
              'shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              active?.id === deck.id
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40'
                : 'border border-rose-700/40 bg-rose-900/50 text-rose-300 hover:bg-rose-900',
            )}
          >
            {deck.emoji} {deck.name}
          </button>
        ))}

        <button
          onClick={() => setNewDeckOpen(true)}
          className="shrink-0 rounded-xl border border-rose-700/40 bg-rose-900/30 px-3 py-1.5 text-xs font-semibold text-rose-400 transition hover:text-rose-200"
        >
          + Deck
        </button>
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {drawing ? (
        <Loading label="Drawing…" />
      ) : exhausted ? (
        <div className="flex min-h-[260px] flex-col items-center justify-center gap-3 rounded-3xl border border-rose-700/50 bg-gradient-to-br from-rose-900/80 to-rose-950 p-8 text-center shadow-2xl">
          <span className="text-4xl">{active?.emoji}</span>
          <p className="text-lg font-bold text-white">You've played every card in here</p>
          <p className="max-w-xs text-xs text-rose-300">
            {active?.slug === 'inside_joke'
              ? 'This deck ships empty on purpose — nobody else could write it.'
              : 'Write your own, or pick another deck above.'}
          </p>
          <button
            onClick={() => setNewCardOpen(true)}
            className="mt-2 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 hover:to-rose-500"
          >
            Write a new one ✨
          </button>
        </div>
      ) : card && active ? (
        <>
          <div className="flip-scene">
            <div key={card.id} className={cx('flip-card min-h-[260px]', flipped && 'is-flipped')}>
              {/* face down */}
              <div className="flip-face flip-front card-back flex min-h-[260px] items-center justify-center rounded-3xl">
                <span className="text-4xl opacity-60">🃏</span>
              </div>

              {/* face up */}
              <article className="flip-face flip-back flex min-h-[260px] flex-col justify-between rounded-3xl border border-rose-700/50 bg-gradient-to-br from-rose-900/80 to-rose-950 p-8 shadow-2xl">
                <div className="flex items-center justify-between text-xs font-medium text-rose-400">
                  <span>
                    {active.emoji} {active.name} Deck
                  </span>
                  <span>{card.kind === 'dare' ? 'Dare 🎭' : 'Question'}</span>
                </div>

                <div className="my-auto py-6">
                  <p className="text-center text-xl font-bold tracking-wide text-white sm:text-2xl">
                    “{card.body}”
                  </p>
                </div>

                <div className="text-center text-xs text-rose-300/70">
                  {played} played this session
                </div>
              </article>
            </div>
          </div>

          <textarea
            rows={3}
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder={
              card.kind === 'dare'
                ? 'Say when it’s done…'
                : 'Answer out loud, or write it here…'
            }
            className="w-full resize-none rounded-2xl border border-rose-700/40 bg-rose-950/50 p-4 text-sm text-rose-100 placeholder-rose-400/50 focus:border-pink-500 focus:outline-none"
          />

          <div className="flex gap-2">
            <button
              onClick={() => void finish(true)}
              className="flex-1 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 hover:to-rose-500"
            >
              {card.kind === 'dare' ? 'Done — next ⚡' : 'Answered — next ⚡'}
            </button>
            <button
              onClick={() => void finish(false)}
              className="rounded-2xl bg-rose-900/60 px-5 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-900"
            >
              Skip
            </button>
            <button
              onClick={() => setNewCardOpen(true)}
              className="rounded-2xl border border-rose-700/40 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-900/40"
            >
              +
            </button>
          </div>
        </>
      ) : null}

      <NewCardModal
        open={newCardOpen}
        onClose={() => setNewCardOpen(false)}
        decks={decks}
        defaultDeck={active}
        coupleId={coupleId}
        onSaved={() => {
          setNewCardOpen(false)
          if (active) void draw(active)
        }}
      />
      <NewDeckModal
        open={newDeckOpen}
        onClose={() => setNewDeckOpen(false)}
        coupleId={coupleId}
        onSaved={() => {
          setNewDeckOpen(false)
          void loadDecks()
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function NewCardModal({
  open,
  onClose,
  decks,
  defaultDeck,
  coupleId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  decks: CardDeck[]
  defaultDeck: CardDeck | null
  coupleId: string | null
  onSaved: () => void
}) {
  const [deckId, setDeckId] = useState(defaultDeck?.id ?? '')
  const [body, setBody] = useState('')
  const [kind, setKind] = useState<'question' | 'dare'>('question')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (open) setDeckId(defaultDeck?.id ?? decks[0]?.id ?? '')
  }, [open, defaultDeck, decks])

  async function save() {
    if (!body.trim() || !deckId || !coupleId) return
    setBusy(true)
    setError('')

    const { error: insertError } = await supabase.from('cards').insert({
      deck_id: deckId,
      couple_id: coupleId,
      body: body.trim(),
      kind,
      created_by: (await supabase.auth.getUser()).data.user!.id,
    })

    setBusy(false)
    if (insertError) return setError(errorMessage(insertError))
    setBody('')
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="Write a card 🃏">
      <div className="space-y-4">
        <Field label="Deck">
          <select
            value={deckId}
            onChange={(e) => setDeckId(e.target.value)}
            className="w-full rounded-xl border border-rose-700/50 bg-rose-900/40 p-3 text-sm text-rose-100 focus:border-pink-500 focus:outline-none"
          >
            {decks.map((d) => (
              <option key={d.id} value={d.id} className="bg-rose-950">
                {d.emoji} {d.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Card">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="The thing only the two of you would understand…"
            className="min-h-24"
          />
        </Field>

        <div className="flex gap-2">
          {(['question', 'dare'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={cx(
                'flex-1 rounded-xl py-2 text-sm font-semibold transition',
                kind === k
                  ? 'bg-rose-600 text-white'
                  : 'border border-rose-700/40 bg-rose-900/50 text-rose-300',
              )}
            >
              {k === 'question' ? 'Question' : 'Dare 🎭'}
            </button>
          ))}
        </div>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button
          disabled={busy || !body.trim()}
          onClick={() => void save()}
          className="w-full rounded-2xl bg-pink-600 py-3 text-sm font-semibold text-white shadow transition hover:bg-pink-500 disabled:opacity-50"
        >
          {busy ? 'Adding…' : 'Add to deck 📌'}
        </button>
      </div>
    </Modal>
  )
}

const DECK_ACCENTS = ['#E8879B', '#F0B429', '#D65A5A', '#5FA8A0', '#7C7BC4', '#EC4899']

function NewDeckModal({
  open,
  onClose,
  coupleId,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  coupleId: string | null
  onSaved: () => void
}) {
  const [name, setName] = useState('')
  const [emoji, setEmoji] = useState('✨')
  const [description, setDescription] = useState('')
  const [accent] = useState(DECK_ACCENTS[5])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save() {
    if (!name.trim() || !coupleId) return
    setBusy(true)
    setError('')

    const { error: insertError } = await supabase.from('card_decks').insert({
      couple_id: coupleId,
      slug: name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, ''),
      name: name.trim(),
      emoji: emoji || '✨',
      description: description.trim() || null,
      accent,
      sort_order: 200,
    })

    setBusy(false)
    if (insertError) return setError(errorMessage(insertError))
    setName('')
    setDescription('')
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title="New deck ✨">
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="w-20">
            <Field label="Emoji">
              <Input
                value={emoji}
                onChange={(e) => setEmoji(e.target.value)}
                maxLength={4}
                className="text-center text-2xl"
              />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="Name">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="3am thoughts"
                maxLength={40}
              />
            </Field>
          </div>
        </div>

        <Field label="What's it for?">
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="The questions we only ask when it's late"
            maxLength={120}
          />
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <button
          disabled={busy || !name.trim()}
          onClick={() => void save()}
          className="w-full rounded-2xl bg-pink-600 py-3 text-sm font-semibold text-white shadow transition hover:bg-pink-500 disabled:opacity-50"
        >
          {busy ? 'Creating…' : 'Create deck'}
        </button>
      </div>
    </Modal>
  )
}
