import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Field, Input, Loading, Modal, Textarea } from '../components/ui'
import VoiceRecorder from '../components/VoiceRecorder'
import EmojiPicker from '../components/EmojiPicker'
import Games from '../components/Games'
import { signedUrl, uploadMedia } from '../lib/media'
import type { CardDeck } from '../lib/types'
import Emoji from '../components/Emoji'

/** One card, on the table for both of you. See 0038_card_rounds.sql. */
type Round = {
  round_id: string
  card_id: string
  body: string
  kind: 'question' | 'dare'
  deck_id: string
  opened_at: string
  i_answered: boolean
  partner_answered: boolean
  revealed: boolean
  my_response: string | null
  my_voice_path: string | null
  partner_response: string | null
  partner_voice_path: string | null
  partner_name: string | null
  answered_at: string | null
  partner_answered_at: string | null
}

/**
 * The deck, played by two.
 *
 * It used to deal privately: you drew, you answered into a box nothing ever
 * read back, and the card vanished for your partner as well. Now one card per
 * deck sits on the table, you both answer it, and neither answer shows until
 * both are in. The withholding is a `case when` in `current_round()`, not a
 * branch in this file — the same shape as the daily question.
 */
export default function Cards() {
  const { coupleId, refresh } = useSession()
  const [decks, setDecks] = useState<CardDeck[]>([])
  const [active, setActive] = useState<CardDeck | null>(null)
  const [round, setRound] = useState<Round | null>(null)
  const [response, setResponse] = useState('')
  const [loading, setLoading] = useState(true)
  const [drawing, setDrawing] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')
  const [exhausted, setExhausted] = useState(false)
  const [flipped, setFlipped] = useState(false)
  const [played, setPlayed] = useState(0)
  const [voice, setVoice] = useState<File | null>(null)
  const [editing, setEditing] = useState(false)
  const [newCardOpen, setNewCardOpen] = useState(false)
  const [newDeckOpen, setNewDeckOpen] = useState(false)
  /** The deck and the games are the same screen — both are 'what shall we do'. */
  const [tab, setTab] = useState<'deck' | 'games'>('deck')

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
      if (rows && rows.length > 0) void open(rows[0])
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadDecks])

  // Deal face-down, then turn it — the pause is what makes it feel dealt. Keyed
  // on the round rather than the card, so re-reading the same card when your
  // partner answers doesn't flip it over again under you.
  useEffect(() => {
    if (!round) return
    setFlipped(false)
    const timer = setTimeout(() => setFlipped(true), 160)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [round?.round_id])

  /** Re-read the deck's open round without throwing away what you've typed. */
  const read = useCallback(async (deck: CardDeck) => {
    const { data, error: rpcError } = await supabase.rpc('current_round', {
      target_deck: deck.id,
    })
    if (rpcError) {
      setError(errorMessage(rpcError))
      return null
    }

    // `returns table` is a set; an empty one is the deck being spent.
    const next = ((data as Round[]) ?? [])[0] ?? null
    setExhausted(!next)
    setRound(next)
    return next
  }, [])

  /**
   * Their answer lands while you are looking at the card, not the next time you
   * open the app. Only a nudge to re-read — the reveal itself still happens in
   * Postgres.
   */
  const activeRef = useRef<CardDeck | null>(null)
  activeRef.current = active

  useEffect(() => {
    if (!coupleId) return
    const channel = supabase
      .channel(`card-plays-${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'card_plays', filter: `couple_id=eq.${coupleId}` },
        () => {
          const deck = activeRef.current
          if (deck) void read(deck)
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, read])

  /** Switch decks — or come back to the card already on the table. */
  async function open(deck: CardDeck) {
    setActive(deck)
    setDrawing(true)
    setError('')
    setExhausted(false)
    setRound(null)
    setResponse('')
    setVoice(null)
    setEditing(false)

    const next = await read(deck)
    setDrawing(false)

    // Your own answer comes back with the round, so leaving the deck and
    // returning doesn't lose it.
    if (next?.my_response) setResponse(next.my_response)
  }

  /** Your half of the round. Theirs stays hidden until this lands. */
  async function answer() {
    if (!round || !coupleId || sending) return
    if (!response.trim() && !voice && !round.my_voice_path) return

    setSending(true)
    setError('')

    let voicePath: string | null = round.my_voice_path
    if (voice) {
      try {
        voicePath = (await uploadMedia(coupleId, 'cards', voice)).path
      } catch (err) {
        setSending(false)
        return setError(errorMessage(err))
      }
    }

    const { error: rpcError } = await supabase.rpc('answer_card', {
      target_round: round.round_id,
      body: response.trim() || null,
      voice: voicePath,
    })

    setSending(false)
    if (rpcError) return setError(errorMessage(rpcError))

    setVoice(null)
    setEditing(false)
    setPlayed((n) => n + 1)
    await supabase.rpc('sync_achievements')
    await refresh()
    if (active) await read(active)
  }

  /** Clear the table and deal the next one. Either of you can, answered or not. */
  async function nextCard() {
    if (!active) return
    setDrawing(true)
    const { error: rpcError } = await supabase.rpc('next_card', { target_deck: active.id })
    if (rpcError) {
      setDrawing(false)
      return setError(errorMessage(rpcError))
    }
    await open(active)
  }

  if (loading) return <Loading label="Shuffling…" />

  return (
    <div className="space-y-4">
      {/* Deck or games. Same screen because the question they answer is the
          same one — it is Friday and we want something to do together. */}
      <div className="grid grid-cols-2 gap-2 rounded-2xl border border-rose-800/40 bg-rose-950/40 p-1">
        {([['deck', 'The deck'], ['games', 'Games']] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={cx(
              'rounded-xl py-2 text-sm font-semibold transition',
              tab === key ? 'bg-rose-600 text-white shadow' : 'text-rose-300 hover:bg-rose-900/40',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'games' ? (
        <Games />
      ) : (
        <>
      {/* deck filters */}
      <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
        {decks.map((deck) => (
          <button
            key={deck.id}
            onClick={() => void open(deck)}
            className={cx(
              'shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
              active?.id === deck.id
                ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40'
                : 'border border-rose-700/40 bg-rose-900/50 text-rose-300 hover:bg-rose-900',
            )}
          >
            <span className="flex items-center gap-1.5">
              <Emoji size={15}>{deck.emoji}</Emoji>
              {deck.name}
            </span>
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
          <Emoji size={40}>{active?.emoji ?? '🃏'}</Emoji>
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
      ) : round && active ? (
        <>
          <div className="flip-scene">
            <div
              key={round.round_id}
              className={cx('flip-card min-h-[260px]', flipped && 'is-flipped')}
            >
              {/* face down */}
              <div className="flip-face flip-front card-back flex min-h-[260px] items-center justify-center rounded-3xl">
                <Emoji size={40} className="opacity-60">🃏</Emoji>
              </div>

              {/* face up */}
              <article className="flip-face flip-back flex min-h-[260px] flex-col justify-between rounded-3xl border border-rose-700/50 bg-gradient-to-br from-rose-900/80 to-rose-950 p-8 shadow-2xl">
                <div className="flex items-center justify-between text-xs font-medium text-rose-400">
                  <span className="flex items-center gap-1.5">
                    <Emoji size={14}>{active.emoji}</Emoji>
                    {active.name} Deck
                  </span>
                  <span>{round.kind === 'dare' ? 'Dare 🎭' : 'Question'}</span>
                </div>

                <div className="my-auto py-6">
                  <p className="text-center text-xl font-bold tracking-wide text-white sm:text-2xl">
                    “{round.body}”
                  </p>
                </div>

                {/* Who is still holding the table up. Before, the card gave no
                    sign the other person existed. */}
                <div className="flex items-center justify-center gap-2 text-xs text-rose-300/70">
                  <Dot on={round.i_answered} label="You" />
                  <span className="text-rose-700">·</span>
                  <Dot on={round.partner_answered} label={round.partner_name ?? 'Them'} />
                </div>
              </article>
            </div>
          </div>

          {round.revealed ? (
            /* Both in. Yours on the right, the way replies sit everywhere else. */
            <div className="animate-rise space-y-2">
              <Answer
                name={round.partner_name ?? 'Them'}
                body={round.partner_response}
                voicePath={round.partner_voice_path}
                mine={false}
              />
              <Answer
                name="You"
                body={round.my_response}
                voicePath={round.my_voice_path}
                mine
              />

              <div className="flex gap-2 pt-1">
                <button
                  onClick={() => void nextCard()}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 hover:to-rose-500"
                >
                  Next card ⚡
                </button>
                <button
                  onClick={() => setNewCardOpen(true)}
                  className="rounded-2xl border border-rose-700/40 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-900/40"
                >
                  +
                </button>
              </div>
            </div>
          ) : round.i_answered && !editing ? (
            /* Written, waiting. Your own words stay on screen — it is theirs
               that are withheld, and only until you have both written. */
            <div className="animate-rise space-y-3">
              <Answer name="You" body={round.my_response} voicePath={round.my_voice_path} mine />

              <div className="rounded-2xl border border-dashed border-rose-700/40 bg-rose-900/20 p-4 text-center">
                <p className="text-sm font-semibold text-rose-100">
                  Waiting on {round.partner_name ?? 'them'} 💭
                </p>
                <p className="mt-1 text-xs text-rose-400">
                  Their answer shows up here the moment they write it. Neither of you can
                  read the other first.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setEditing(true)}
                  className="flex-1 rounded-2xl bg-rose-900/60 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-900"
                >
                  Change my answer
                </button>
                <button
                  onClick={() => void nextCard()}
                  className="rounded-2xl border border-rose-700/40 px-4 py-3 text-sm font-semibold text-rose-300 transition hover:bg-rose-900/40"
                >
                  Skip this one
                </button>
              </div>
            </div>
          ) : (
            <>
              <textarea
                rows={3}
                value={response}
                onChange={(e) => setResponse(e.target.value)}
                placeholder={
                  round.kind === 'dare'
                    ? 'Say when it’s done…'
                    : `Answer here — ${round.partner_name ?? 'they'} won't see it until ${
                        round.partner_answered ? 'you send it' : 'they answer too'
                      }…`
                }
                className="w-full resize-none rounded-2xl border border-rose-700/40 bg-rose-950/50 p-4 text-sm text-rose-100 placeholder-rose-400/50 focus:border-pink-500 focus:outline-none"
              />

              {/* Several dares ask for a voice note by name and there was no way
                  to record one — you could only type that you had done it
                  elsewhere. The recorder is the same one the Vault uses. */}
              <VoiceRecorder key={round.round_id} onRecorded={setVoice} maxSeconds={120} />

              {round.partner_answered && (
                <p className="text-center text-xs text-pink-300">
                  {round.partner_name ?? 'They'} already answered — yours unlocks it 🔓
                </p>
              )}

              <div className="flex gap-2">
                <button
                  onClick={() => void answer()}
                  disabled={sending || (!response.trim() && !voice)}
                  className="flex-1 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 hover:to-rose-500 disabled:opacity-40"
                >
                  {sending ? 'Sending…' : round.kind === 'dare' ? 'Done 🎭' : 'Send my answer'}
                </button>
                <button
                  onClick={() => void nextCard()}
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
          )}

          <p className="text-center text-xs text-rose-400/60">{played} answered this session</p>
        </>
      ) : null}
        </>
      )}

      <NewCardModal
        open={newCardOpen}
        onClose={() => setNewCardOpen(false)}
        decks={decks}
        defaultDeck={active}
        coupleId={coupleId}
        onSaved={() => {
          setNewCardOpen(false)
          // Only re-read; a card written mid-round shouldn't clear the table.
          if (active) void read(active)
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

/** Who has written and who hasn't, without giving away a word of it. */
function Dot({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={cx('flex items-center gap-1.5', on ? 'text-pink-300' : 'text-rose-400/60')}>
      <span
        className={cx(
          'size-1.5 rounded-full',
          on ? 'bg-pink-400' : 'animate-pulse bg-rose-600',
        )}
      />
      {label} {on ? 'answered' : 'thinking'}
    </span>
  )
}

/**
 * One side of a revealed round.
 *
 * The voice path arrives as a storage path; the bucket is private, so it needs
 * signing before an <audio> can touch it.
 */
function Answer({
  name,
  body,
  voicePath,
  mine,
}: {
  name: string
  body: string | null
  voicePath: string | null
  mine: boolean
}) {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!voicePath) return setUrl(null)
    void signedUrl(voicePath).then(setUrl)
  }, [voicePath])

  return (
    <div
      className={cx(
        'rounded-2xl px-4 py-3',
        mine
          ? 'ml-6 bg-gradient-to-br from-pink-600/80 to-rose-600/80 text-white'
          : 'mr-6 bg-rose-900/50 text-rose-50',
      )}
    >
      <p className="mb-1 text-[0.65rem] font-semibold tracking-wider text-rose-200/70 uppercase">
        {name}
      </p>
      {body && <p className="text-sm leading-relaxed whitespace-pre-wrap">{body}</p>}
      {url && <audio src={url} controls className="mt-2 w-full" />}
      {!body && !voicePath && <p className="text-sm text-rose-200/60 italic">Answered out loud</p>}
    </div>
  )
}

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
    <Modal open={open} onClose={onClose} title="Write a card" icon="cards">
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
    <Modal open={open} onClose={onClose} title="New deck" icon="sparkle">
      <div className="space-y-4">
        <Field label="Name">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="3am thoughts"
            maxLength={40}
          />
        </Field>

        <Field label={`Emoji — ${emoji}`}>
          <EmojiPicker value={emoji} onPick={setEmoji} />
        </Field>

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
