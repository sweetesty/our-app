import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { cx, ErrorNote, Loading, PageHeader } from '../components/ui'
import { longDate } from '../lib/format'
import type { Achievement, AchievementDef, CoupleStats } from '../lib/types'

export default function Us() {
  const { summary } = useSession()
  const [defs, setDefs] = useState<AchievementDef[]>([])
  const [earned, setEarned] = useState<Achievement[]>([])
  const [stats, setStats] = useState<CoupleStats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    // Recompute first so anything crossed since the last visit shows as earned.
    await supabase.rpc('sync_achievements')

    const [{ data: d, error: dErr }, { data: e }, { data: s }] = await Promise.all([
      supabase.from('achievement_defs').select('*').order('sort_order'),
      supabase.from('achievements').select('*'),
      supabase.from('couple_stats').select('*').maybeSingle(),
    ])

    if (dErr) setError(errorMessage(dErr))
    setDefs((d as AchievementDef[]) ?? [])
    setEarned((e as Achievement[]) ?? [])
    setStats((s as CoupleStats) ?? null)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading) return <Loading label="Counting…" />

  const streak = stats?.current_streak ?? 0
  const longest = stats?.longest_streak ?? 0
  const unlocked = new Set(earned.map((a) => a.slug))

  return (
    <>
      <PageHeader eyebrow="Where we're at" title="Us">
        Not a scoreboard. Just proof you kept showing up.
      </PageHeader>

      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      <div className="paper taped tilt-b mb-6 px-7 pt-11 pb-8 text-center shadow-[var(--shadow-bloom)]">
        <p className="label mb-2">Answering together</p>
        <p
          className="font-display text-7xl leading-none text-lav-500"
          style={{
            textShadow: '0 3px 0 var(--color-blush-400), 0 -3px 0 var(--color-blush-400), 3px 0 0 var(--color-blush-400), -3px 0 0 var(--color-blush-400)',
          }}
        >
          {streak}
        </p>
        <p className="mt-2 text-sm text-ink-muted">
          {streak === 0
            ? 'Answer today’s question to start one.'
            : streak === 1
              ? 'day. It starts somewhere.'
              : 'days in a row ❤️'}
        </p>
        {longest > streak && (
          <p className="mt-1 text-xs text-ink-faint">Your best run was {longest} days.</p>
        )}
        {summary?.couple?.anniversary && (
          <p className="mt-4 border-t border-line/50 pt-4 text-xs text-ink-faint">
            Together since {longDate(summary.couple.anniversary)}
          </p>
        )}
      </div>

      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat label="Answers" value={stats?.answers_given ?? 0} emoji="💌" />
        <Stat label="Cards played" value={stats?.cards_played ?? 0} emoji="🃏" />
        <Stat label="Notes" value={stats?.notes_written ?? 0} emoji="📌" />
        {/* This tile used to say "Memories" while counting timeline entries,
            so a couple with photos and notes still saw 0. */}
        <Stat label="Moments" value={stats?.moments_sent ?? 0} emoji="📸" />
        <Stat label="Timeline" value={stats?.memories_added ?? 0} emoji="🗓️" />
        <Stat label="Compliments" value={stats?.compliments_sent ?? 0} emoji="💕" />
        <Stat label="Sealed letters" value={stats?.vault_items ?? 0} emoji="🔒" />
        <Stat label="Little nudges" value={stats?.nudges_sent ?? 0} emoji="🫂" />
      </div>

      <section className="space-y-3">
        <h2 className="label">Along the way</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {defs.map((def) => {
            const value = Number(stats?.[def.metric] ?? 0)
            const done = unlocked.has(def.slug)
            const pct = Math.min(100, Math.round((value / def.target) * 100))

            return (
              <div
                key={def.slug}
                className={
                  done
                    ? 'paper animate-rise p-4'
                    : 'surface animate-rise p-4 opacity-70 transition-opacity hover:opacity-100'
                }
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cx(
                      'grid size-12 shrink-0 place-items-center rounded-full text-2xl',
                      done
                        ? 'stamp earned rotate-[-7deg] bg-blush-300/50 text-blush-600'
                        : 'unearned bg-sunken',
                    )}
                  >
                    {def.emoji}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{def.name}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-ink-faint">
                      {def.description}
                    </p>

                    {!done && (
                      <div className="mt-2.5 space-y-1">
                        <div className="h-1 overflow-hidden rounded-full bg-canvas">
                          <div
                            className="h-full rounded-full bg-lav-500/70 transition-[width] duration-500"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="text-[0.65rem] text-ink-faint">
                          {Math.min(value, def.target)} / {def.target}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </>
  )
}

function Stat({ label, value, emoji }: { label: string; value: number; emoji: string }) {
  return (
    <div className="surface animate-rise px-4 py-4 text-center">
      <p className="text-xl">{emoji}</p>
      <p className="mt-1 font-display text-2xl text-ink">{value.toLocaleString()}</p>
      <p className="text-[0.65rem] tracking-wide text-ink-faint uppercase">{label}</p>
    </div>
  )
}
