import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Loading } from './ui'
import Emoji from './Emoji'
import type { Game, GameRound } from '../lib/types'

/**
 * The games, under Cards.
 *
 * You pick a game, then it deals prompts from that game until the set is done.
 * Three mechanics cover all of them (see 0046_games.sql): both pick from two
 * options and see whether you matched; one answers honestly and the other
 * guesses; or there's nothing to score and the prompt is just a thing to do.
 *
 * Scoring is deliberately light. It shows at the end, there's no running total
 * across sittings and no leaderboard — "8 out of 10 😂" and then it's gone. A
 * couple keeping score against each other is the failure mode, not the goal.
 */
export default function Games() {
  const { coupleId, summary } = useSession()
  const [games, setGames] = useState<Game[]>([])
  const [session, setSession] = useState<string | null>(null)
  const [round, setRound] = useState<GameRound | null>(null)
  const [draft, setDraft] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const partnerName = summary?.partner?.display_name ?? 'They'
  const game = games.find((g) => g.slug === round?.game_slug) ?? null

  useEffect(() => {
    void supabase
      .from('games')
      .select('*')
      .eq('is_active', true)
      .order('sort_order')
      .then(({ data, error: qErr }) => {
        // Swallowing this left the tab completely blank when the table wasn't
        // there yet, which reads as "broken" rather than "not set up".
        if (qErr) setError(errorMessage(qErr))
        setGames((data as Game[]) ?? [])
        setLoading(false)
      })
  }, [])

  const read = useCallback(async (id: string, slug: string) => {
    const { data, error: rpcError } = await supabase.rpc('current_game_round', {
      session: id,
    })
    if (rpcError) {
      setError(errorMessage(rpcError))
      return
    }
    const next = ((data as GameRound[]) ?? [])[0] ?? null
    setRound(next ? { ...next, game_slug: slug } : null)
    // Their answer may already be in from a previous sitting; don't wipe what
    // you're mid-way through typing.
    setDraft((d) => d || next?.my_answer || '')
  }, [])

  /** Their answer landing should move the screen, not wait for a refresh. */
  const sessionRef = useRef<{ id: string; slug: string } | null>(null)
  useEffect(() => {
    if (!coupleId || !session) return
    const channel = supabase
      .channel(`game-${session}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'game_answers' },
        () => {
          const s = sessionRef.current
          if (s) void read(s.id, s.slug)
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, session, read])

  async function start(g: Game) {
    setBusy(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('start_game', { game: g.slug })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))

    const id = data as string
    sessionRef.current = { id, slug: g.slug }
    setSession(id)
    setDraft('')
    await read(id, g.slug)
  }

  async function answer(value: string) {
    if (!round || !value.trim() || busy) return
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('answer_game', {
      round: round.round_id,
      value: value.trim(),
    })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    setDraft('')
    const s = sessionRef.current
    if (s) await read(s.id, s.slug)
  }

  async function quit() {
    if (session) await supabase.rpc('end_game', { session })
    sessionRef.current = null
    setSession(null)
    setRound(null)
    setDraft('')
  }

  if (loading) return <Loading label="Setting up…" />

  /* ---- choosing ---------------------------------------------------------- */

  if (!session || !round) {
    return (
      <div className="space-y-3">
        {error && <ErrorNote>{error}</ErrorNote>}
        <p className="text-xs text-rose-400">
          Pick one. You both answer on your own phones, and nothing shows until you’ve
          both had your turn.
        </p>

        {games.length === 0 && !error && (
          <div className="rounded-2xl border border-dashed border-rose-700/40 bg-rose-900/20 p-6 text-center">
            <p className="text-sm text-rose-200">No games are set up yet.</p>
            <p className="mt-1 text-xs text-rose-400">
              Run migrations 0046 and 0047 and they’ll appear here.
            </p>
          </div>
        )}

        <ul className="space-y-2">
          {games.map((g) => (
            <li key={g.slug}>
              <button
                disabled={busy}
                onClick={() => void start(g)}
                className="flex w-full items-center gap-3 rounded-2xl border border-rose-700/30 bg-rose-900/25 p-4 text-left transition hover:-translate-y-0.5 hover:bg-rose-900/40 disabled:opacity-60"
              >
                <Emoji size={26}>{g.emoji}</Emoji>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-bold text-white">{g.name}</span>
                  <span className="block truncate text-xs text-rose-400">{g.tagline}</span>
                </span>
                <span className="shrink-0 text-[0.65rem] text-rose-500">{g.rounds}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    )
  }

  /* ---- the end ----------------------------------------------------------- */

  if (round.finished) {
    const scored = round.scored ?? 0
    const score = round.score ?? 0

    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3 rounded-3xl border border-rose-700/50 bg-gradient-to-br from-rose-900/80 to-rose-950 p-8 text-center shadow-2xl">
        <Emoji size={46}>{game?.emoji ?? '🎉'}</Emoji>

        {scored > 0 ? (
          <>
            <p className="text-2xl font-bold text-white">
              You got {score}/{scored}! <Emoji size={24}>😂</Emoji>
            </p>
            <p className="max-w-xs text-xs text-rose-300">
              {score === scored
                ? 'Suspicious, frankly.'
                : score === 0
                  ? 'Genuinely impressive in the other direction.'
                  : 'Somewhere between "we know each other" and "do we".'}
            </p>
          </>
        ) : (
          <>
            <p className="text-xl font-bold text-white">That’s the lot.</p>
            <p className="max-w-xs text-xs text-rose-300">
              Nothing to score in this one — that was the point.
            </p>
          </>
        )}

        <button
          onClick={() => void quit()}
          className="mt-2 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 hover:to-rose-500"
        >
          Pick another game
        </button>
      </div>
    )
  }

  /* ---- playing ----------------------------------------------------------- */

  const isMatch = round.mode === 'match'
  const isGuess = round.mode === 'guess'
  const answered = round.my_answer !== null

  // In a guess round the prompt reads differently depending which side of it
  // you're on — "What's my comfort food?" is asked of one of you and guessed
  // by the other, and showing the same words to both is what makes those
  // games confusing.
  const lead = isGuess
    ? round.i_am_subject
      ? 'Answer honestly — they’re guessing'
      : `Guess what ${round.subject_name ?? partnerName} said`
    : null

  return (
    <div className="space-y-4">
      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="flex items-center justify-between text-xs text-rose-400">
        <span className="flex items-center gap-1.5">
          <Emoji size={14}>{game?.emoji ?? '🎮'}</Emoji>
          {game?.name}
        </span>
        <span>
          {round.idx} of {round.total}
        </span>
      </div>

      <article className="rounded-3xl border border-rose-700/50 bg-gradient-to-br from-rose-900/80 to-rose-950 p-7 shadow-2xl">
        {lead && (
          <p className="mb-3 text-center text-[0.65rem] font-semibold tracking-wider text-pink-300 uppercase">
            {lead}
          </p>
        )}
        <p className="text-center text-xl font-bold text-white sm:text-2xl">{round.body}</p>
      </article>

      {round.revealed ? (
        <div className="animate-rise space-y-2">
          {/* Both in. What was said, and whether it counted. */}
          {round.mode !== 'draw' && (
            <div
              className={cx(
                'rounded-2xl border p-4 text-center',
                round.correct
                  ? 'border-emerald-500/40 bg-emerald-500/10'
                  : 'border-rose-700/40 bg-rose-900/30',
              )}
            >
              <p className="text-sm font-bold text-white">
                {round.correct
                  ? isMatch
                    ? 'You both said the same thing ✓'
                    : 'Got it ✓'
                  : isMatch
                    ? 'Different answers 😂'
                    : 'Not quite 😂'}
              </p>
            </div>
          )}

          <div className="rounded-2xl bg-rose-900/50 px-4 py-3">
            <p className="text-[0.65rem] tracking-wider text-rose-300/70 uppercase">
              {partnerName}
            </p>
            <p className="text-sm text-rose-50">{round.their_answer ?? '—'}</p>
          </div>
          <div className="ml-6 rounded-2xl bg-gradient-to-br from-pink-600/80 to-rose-600/80 px-4 py-3">
            <p className="text-[0.65rem] tracking-wider text-rose-100/70 uppercase">You</p>
            <p className="text-sm text-white">{round.my_answer ?? '—'}</p>
          </div>

          <button
            onClick={() => {
              const s = sessionRef.current
              if (s) void read(s.id, s.slug)
            }}
            className="w-full rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 hover:to-rose-500"
          >
            Next ⚡
          </button>
        </div>
      ) : answered ? (
        <div className="animate-rise space-y-3">
          <div className="rounded-2xl border border-dashed border-rose-700/40 bg-rose-900/20 p-4 text-center">
            <p className="text-sm font-semibold text-rose-100">
              Waiting on {partnerName} 💭
            </p>
            <p className="mt-1 text-xs text-rose-400">
              You said “{round.my_answer}”. They can’t see it yet.
            </p>
          </div>
          <button
            onClick={() => void answer(round.my_answer ?? '')}
            className="w-full rounded-2xl bg-rose-900/60 py-3 text-sm font-semibold text-rose-200 transition hover:bg-rose-900"
            disabled
          >
            Answered
          </button>
        </div>
      ) : isMatch ? (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {[round.option_a, round.option_b].map(
            (opt) =>
              opt && (
                <button
                  key={opt}
                  disabled={busy}
                  onClick={() => void answer(opt)}
                  className="rounded-2xl border border-rose-700/40 bg-rose-900/40 p-5 text-sm font-semibold text-rose-50 transition hover:-translate-y-0.5 hover:border-pink-500/50 hover:bg-rose-900/70 disabled:opacity-60"
                >
                  {opt}
                </button>
              ),
          )}
        </div>
      ) : round.mode === 'draw' ? (
        <button
          disabled={busy}
          onClick={() => void answer('done')}
          className="w-full rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 hover:to-rose-500 disabled:opacity-60"
        >
          Done — next ⚡
        </button>
      ) : (
        <>
          <textarea
            rows={2}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={
              round.i_am_subject ? 'Your honest answer…' : 'What do you think they said…'
            }
            className="w-full resize-none rounded-2xl border border-rose-700/40 bg-rose-950/50 p-4 text-sm text-rose-100 placeholder-rose-400/50 focus:border-pink-500 focus:outline-none"
          />
          <button
            disabled={busy || !draft.trim()}
            onClick={() => void answer(draft)}
            className="w-full rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 hover:to-rose-500 disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Lock it in'}
          </button>
        </>
      )}

      <div className="flex items-center justify-between pt-1 text-xs">
        <span className="text-rose-500">
          {(round.scored ?? 0) > 0 && `${round.score}/${round.scored} so far`}
        </span>
        <button
          onClick={() => void quit()}
          className="text-rose-400 underline-offset-2 transition hover:text-rose-200 hover:underline"
        >
          Stop playing
        </button>
      </div>
    </div>
  )
}
