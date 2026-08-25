import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Loading } from '../components/ui'
import type { DailyAnswer, TodayQuestion } from '../lib/types'

export default function Today() {
  const { summary, userId, refresh } = useSession()
  const [question, setQuestion] = useState<TodayQuestion | null>(null)
  const [answers, setAnswers] = useState<DailyAnswer[]>([])
  const [draft, setDraft] = useState('')
  const [editing, setEditing] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  // Quick signals state
  const [pokeSent, setPokeSent] = useState('')

  // The reveal. `justRevealed` drives the celebration, and it must only fire on
  // a live unlock — opening a question you already revealed yesterday should
  // not throw hearts at you.
  const [justRevealed, setJustRevealed] = useState(false)
  const wasRevealed = useRef(false)
  const seenFirstLoad = useRef(false)

  useEffect(() => {
    if (loading) return
    const revealed = question?.revealed ?? false

    if (!seenFirstLoad.current) {
      seenFirstLoad.current = true
      wasRevealed.current = revealed
      return
    }

    if (revealed && !wasRevealed.current) {
      setJustRevealed(true)
      const timer = setTimeout(() => setJustRevealed(false), 2600)
      wasRevealed.current = revealed
      return () => clearTimeout(timer)
    }

    wasRevealed.current = revealed
  }, [loading, question?.revealed])

  const load = useCallback(async () => {
    setError('')
    const { data, error: rpcError } = await supabase.rpc('today_question')
    if (rpcError) {
      setError(errorMessage(rpcError))
      setLoading(false)
      return
    }

    const today = (data as TodayQuestion[])[0] ?? null
    setQuestion(today)
    setDraft(today?.my_answer ?? '')

    if (today) {
      const { data: rows } = await supabase
        .from('daily_answers')
        .select('*')
        .eq('daily_question_id', today.daily_question_id)
      setAnswers((rows as DailyAnswer[]) ?? [])
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    const coupleId = summary?.couple?.id
    if (!coupleId) return
    const channel = supabase
      .channel(`answers:${coupleId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'daily_answers', filter: `couple_id=eq.${coupleId}` },
        () => void load(),
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [summary?.couple?.id, load])

  async function save() {
    if (!draft.trim()) return
    setSaving(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('answer_today', { answer: draft })
    if (rpcError) setError(errorMessage(rpcError))
    else {
      setEditing(false)
      await load()
      await supabase.rpc('sync_achievements')
      await refresh()
    }
    setSaving(false)
  }

  async function sendPoke(msg: string, kind: string) {
    await supabase.rpc('send_nudge', { nudge_kind: kind, note: msg })
    setPokeSent(`Signal Sent: "${msg}" 💌 Partner notified!`)
    setTimeout(() => { setPokeSent('') }, 3500)
    await refresh()
  }

  if (loading) return <Loading label="Opening today…" />
  if (!question) return <div className="text-center text-rose-300 mt-10">No question today.</div>

  const mine = answers.find((a) => a.author_id === userId) ?? null
  const theirs = answers.find((a) => a.author_id !== userId) ?? null
  const partnerName = summary?.partner?.display_name ?? 'Them'
  const showComposer = !mine || editing

  return (
    <div className="space-y-6">
      
      {/* Quick Signals */}
      <div className="bg-rose-900/30 border border-rose-700/30 rounded-3xl p-5 shadow-xl">
        <h3 className="text-xs font-bold tracking-wider text-rose-300 uppercase mb-3">⚡ Quick Signals</h3>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <button onClick={() => sendPoke('I Miss You 🥺', 'miss_you')}
            className="p-3 bg-rose-800/40 hover:bg-rose-700/50 border border-rose-600/30 rounded-2xl text-xs font-semibold transition text-center text-rose-100">🥺 I Miss You</button>
          <button onClick={() => sendPoke('Thinking of you ❤️', 'thinking')}
            className="p-3 bg-rose-800/40 hover:bg-rose-700/50 border border-rose-600/30 rounded-2xl text-xs font-semibold transition text-center text-rose-100">❤️ Thinking of You</button>
          <button onClick={() => sendPoke('Need you 🫂', 'need_you')}
            className="p-3 bg-rose-800/40 hover:bg-rose-700/50 border border-rose-600/30 rounded-2xl text-xs font-semibold transition text-center text-rose-100">🫂 Need You</button>
          <button onClick={() => sendPoke('Kiss me 😘', 'kiss')}
            className="p-3 bg-rose-800/40 hover:bg-rose-700/50 border border-rose-600/30 rounded-2xl text-xs font-semibold transition text-center text-rose-100">😘 Kiss Me</button>
        </div>
        {pokeSent && (
          <div className="mt-3 text-center text-xs bg-pink-500/20 border border-pink-500/40 py-2 rounded-xl text-pink-200 animate-bounce">
            {pokeSent}
          </div>
        )}
      </div>

      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      {/* Daily Question Card */}
      <div className="bg-gradient-to-br from-rose-900/60 to-rose-950/80 border border-rose-700/40 rounded-3xl p-6 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 transform translate-x-4 -translate-y-4 w-32 h-32 bg-pink-500/10 rounded-full blur-2xl pointer-events-none"></div>
        
        <div className="flex items-center justify-between mb-4">
          <span className="bg-pink-500/20 text-pink-300 border border-pink-500/30 text-xs font-semibold px-3 py-1 rounded-full">💌 Daily Question — Today, Us</span>
          <span className="text-xs text-rose-300">
            {question.partner_answered ? `${partnerName} answered` : 'Waiting on them'}
          </span>
        </div>
        
        <h2 className="text-xl font-bold text-white mb-6">“{question.body}”</h2>

        {showComposer ? (
          <div className="space-y-3 relative z-10">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Type your answer here (hidden until both answer)..."
              className="w-full bg-rose-950/50 border border-rose-700/40 rounded-2xl p-4 text-sm focus:outline-none focus:border-pink-500 text-rose-100 placeholder-rose-400/50 resize-none min-h-[100px]"
            ></textarea>
            
            <div className="flex gap-2">
              {editing && (
                <button onClick={() => { setEditing(false); setDraft(mine?.body ?? '') }}
                  className="w-1/3 py-3 bg-rose-800/50 hover:bg-rose-700/50 text-rose-200 font-semibold rounded-2xl transition text-sm">
                  Cancel
                </button>
              )}
              <button onClick={() => void save()} disabled={!draft.trim() || saving}
                className={cx("flex-1 py-3 bg-gradient-to-r font-semibold rounded-2xl shadow-lg transition text-sm text-white", draft.trim() ? "from-pink-600 to-rose-600 hover:from-pink-500 hover:to-rose-500" : "from-rose-800 to-rose-900 opacity-50")}>
                {saving ? 'Saving...' : (mine ? 'Save ✨' : 'Submit Answer ✨')}
              </button>
            </div>
          </div>
        ) : question.revealed ? (
          <div className="space-y-4 pt-2 relative z-10">
            <div className="p-4 bg-rose-950/60 border border-rose-800/60 rounded-2xl relative group">
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs text-pink-400 font-semibold">Your Answer:</p>
                <button onClick={() => setEditing(true)} className="text-[10px] bg-rose-800/40 hover:bg-rose-700 px-2 py-1 rounded text-rose-300 opacity-0 group-hover:opacity-100 transition">Edit</button>
              </div>
              <p className="text-sm text-rose-100 whitespace-pre-wrap">{mine!.body}</p>
            </div>

            {/* Their answer. The unseal plays whenever this mounts — which is
                exactly the first render after the second answer lands. */}
            <div className="relative">
              {justRevealed && (
                <>
                  {/* the seal giving way */}
                  <span
                    aria-hidden
                    className="animate-seal-break pointer-events-none absolute -top-3 left-1/2 z-20 -translate-x-1/2 text-3xl"
                  >
                    🔒
                  </span>

                  {/* hearts drifting off it */}
                  {[
                    { left: '12%', delay: '0.25s', spin: '-18deg', ch: '💗' },
                    { left: '34%', delay: '0.45s', spin: '14deg', ch: '❤️' },
                    { left: '58%', delay: '0.15s', spin: '22deg', ch: '💕' },
                    { left: '78%', delay: '0.55s', spin: '-12deg', ch: '💗' },
                    { left: '90%', delay: '0.35s', spin: '10deg', ch: '✨' },
                  ].map((h) => (
                    <span
                      key={h.left}
                      aria-hidden
                      className="animate-drift-up pointer-events-none absolute top-0 z-20 text-xl"
                      style={{
                        left: h.left,
                        animationDelay: h.delay,
                        ['--spin' as string]: h.spin,
                      }}
                    >
                      {h.ch}
                    </span>
                  ))}
                </>
              )}

              <div className="animate-unseal p-4 bg-pink-950/40 border border-pink-800/40 rounded-2xl">
                <p className="text-xs text-rose-400 font-semibold mb-1">
                  {partnerName}'s Answer:
                </p>
                <p className="text-sm text-pink-100 italic whitespace-pre-wrap">
                  "{theirs!.body}"
                </p>
              </div>
            </div>

            {justRevealed && (
              <p
                aria-live="polite"
                className="animate-rise text-center text-xs font-semibold text-pink-300"
              >
                Unlocked ✨ you both answered
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4 pt-2 relative z-10">
            <div className="p-4 bg-rose-950/60 border border-rose-800/60 rounded-2xl relative group">
              <div className="flex justify-between items-center mb-1">
                <p className="text-xs text-pink-400 font-semibold">Your Answer:</p>
                <button onClick={() => setEditing(true)} className="text-[10px] bg-rose-800/40 hover:bg-rose-700 px-2 py-1 rounded text-rose-300 opacity-0 group-hover:opacity-100 transition">Edit</button>
              </div>
              <p className="text-sm text-rose-100 whitespace-pre-wrap">{mine!.body}</p>
            </div>
            <div className="p-6 bg-rose-900/20 border border-rose-700/20 rounded-2xl text-center border-dashed">
              <span className="text-2xl mb-2 block animate-pulse">🔒</span>
              <p className="text-sm text-rose-300 font-medium">Waiting on {partnerName}</p>
              <p className="text-xs text-rose-400/70 mt-1">Answers unlock once you both reply.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
