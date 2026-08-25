import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { Loading } from '../components/ui'
import Logo from '../components/Logo'
import { ago } from '../lib/format'
import { useDaysSince } from '../lib/useDaysSince'
import { NUDGES, type TodayQuestion } from '../lib/types'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Still up'
  if (h < 12) return 'Morning'
  if (h < 18) return 'Afternoon'
  return 'Evening'
}

export default function Home() {
  const { summary, refresh } = useSession()
  const [today, setToday] = useState<TodayQuestion | null>(null)
  const [loading, setLoading] = useState(true)
  const [sent, setSent] = useState(false)
  // Above the loading return: hooks cannot sit behind one.
  const together = useDaysSince(summary?.couple?.anniversary)

  useEffect(() => {
    supabase.rpc('today_question').then(({ data }) => {
      setToday(((data as TodayQuestion[]) ?? [])[0] ?? null)
      setLoading(false)
    })
  }, [])

  async function quickMiss() {
    await supabase.rpc('send_nudge', { nudge_kind: 'miss_you', note: null })
    setSent(true)
    setTimeout(() => setSent(false), 2400)
    await refresh()
  }

  if (loading) return <Loading />

  const me = summary?.me
  const partner = summary?.partner
  const stats = summary?.stats
  const readyVault = summary?.ready_vault ?? 0
  const unreadNotes = summary?.unread_notes ?? 0
  const lastNudge = summary?.latest_nudge

  return (
    <>
      {/* The cover of the book. */}
      <header className="paper taped tilt-c animate-rise mb-7 px-6 pt-10 pb-7 text-center">
        <div className="mb-3 flex justify-center">
          <Logo size={52} />
        </div>
        <p className="label">
          {greeting()}, {me?.display_name}
        </p>
        <h1 className="mt-2 font-display text-3xl leading-tight text-ink sm:text-4xl">
          {partner ? `You and ${partner.display_name}` : 'Waiting on them'}
        </h1>

        {together !== null && (
          <div className="mt-5 flex items-end justify-center gap-2.5">
            <span className="font-display text-6xl leading-none text-lav-500">
              {together.toLocaleString()}
            </span>
            <span className="script pb-1 text-xl text-blush-600">days in</span>
          </div>
        )}

        {together === null && partner && (
          <Link to="/settings" className="script mt-3 inline-block text-lg text-blush-600 underline-offset-4 hover:underline">
            add the day it started →
          </Link>
        )}
      </header>

      {!partner && (
        <Link
          to="/settings"
          className="paper animate-rise mb-4 block p-5 shadow-[var(--shadow-bloom)]"
        >
          <p className="text-base text-ink">Your space is still one person</p>
          <p className="mt-1 text-sm text-ink-muted">
            Send them your invite code — it's in Settings. Everything works better with
            two.
          </p>
        </Link>
      )}

      {/* Today */}
      <Link
        to="/today"
        className={
          today?.my_answer
            ? 'surface animate-rise mb-4 block p-6 transition-transform hover:-translate-y-0.5'
            : 'paper taped taped-right tilt-b animate-rise mb-4 block px-6 pt-9 pb-6 shadow-[var(--shadow-bloom)]'
        }
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="label">Today, Us</span>
          <span className="text-xs text-ink-faint">
            {today?.revealed
              ? 'unlocked ✨'
              : today?.my_answer
                ? 'waiting on them'
                : today?.partner_answered
                  ? 'they answered — your turn'
                  : 'unanswered'}
          </span>
        </div>
        <p className="font-display text-xl leading-snug text-ink">
          {today?.body ?? 'Open today’s question'}
        </p>
        {!today?.my_answer && (
          <p className="mt-3 text-sm text-lav-300">Write your answer →</p>
        )}
      </Link>

      {/* Things waiting */}
      {(readyVault > 0 || unreadNotes > 0) && (
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          {readyVault > 0 && (
            <Link to="/vault" className="paper animate-rise p-5 shadow-[var(--shadow-bloom)]">
              <span className="animate-pulse-soft block text-2xl">✨</span>
              <p className="mt-2 text-base text-ink">
                {readyVault} letter{readyVault > 1 ? 's' : ''} ready to open
              </p>
              <p className="text-sm text-ink-muted">They left {readyVault > 1 ? 'them' : 'it'} for you.</p>
            </Link>
          )}
          {unreadNotes > 0 && (
            <Link to="/notes" className="surface animate-rise p-5">
              <span className="block text-2xl">📌</span>
              <p className="mt-2 text-base text-ink">
                {unreadNotes} note{unreadNotes > 1 ? 's' : ''} you haven't read
              </p>
              <p className="text-sm text-ink-muted">On the wall.</p>
            </Link>
          )}
        </div>
      )}

      {/* Quick nudge */}
      <button
        onClick={() => void quickMiss()}
        className="surface animate-rise mb-4 flex w-full items-center gap-4 p-5 text-left transition-transform active:scale-[0.99]"
      >
        <span className="text-3xl">{sent ? '💌' : '🥺'}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-base text-ink">
            {sent ? 'Sent.' : 'I miss you'}
          </span>
          <span className="block text-sm text-ink-muted">
            {sent
              ? `${partner?.display_name ?? 'They'} will see it in a second`
              : lastNudge
                ? `${partner?.display_name ?? 'They'} ${NUDGES.find((n) => n.kind === lastNudge.kind)?.sent} ${ago(lastNudge.created_at)}`
                : 'One tap, straight to their phone'}
          </span>
        </span>
        <span className="text-xs text-ink-faint">tap</span>
      </button>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile to="/cards" emoji="🃏" label="Draw a card" />
        <Tile to="/timeline" emoji="🗓️" label="Timeline" />
        <Tile to="/vault" emoji="🔒" label="The vault" />
        <Tile
          to="/us"
          emoji="🔥"
          label={stats?.current_streak ? `${stats.current_streak}-day streak` : 'Us'}
        />
      </div>
    </>
  )
}

function Tile({ to, emoji, label }: { to: string; emoji: string; label: string }) {
  return (
    <Link
      to={to}
      className="surface animate-rise grid place-items-center gap-2 px-3 py-6 text-center transition-transform hover:-translate-y-0.5"
    >
      <span className="text-2xl">{emoji}</span>
      <span className="text-xs text-ink-muted">{label}</span>
    </Link>
  )
}
