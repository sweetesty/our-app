import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { signedUrl } from '../lib/media'
import { useSession } from '../context/SessionProvider'
import { cx } from './ui'
import Emoji from './Emoji'
import type { OnThisDayItem, AnsweredBefore } from '../lib/types'

/**
 * The archive, reading itself back.
 *
 * Every other screen in this app writes. Notes, moments, milestones, card
 * answers, letters — all timestamped, all sat there, none of it ever looked at
 * again. This is the only thing that reads, which is most of why it's worth
 * having at all.
 *
 * Two different things, and the second is better. "On this day" is whatever
 * happened on this date in an earlier year. Underneath it, when today's
 * question has been asked before, is what the two of you said last time — the
 * single most interesting thing the archive can hand back, and only possible
 * since rounds made old answers readable.
 *
 * Shows nothing at all when there is nothing. A card that says "no memories
 * yet" every day for a year is worse than no card.
 */

const LABELS: Record<string, { emoji: string; word: string }> = {
  note: { emoji: '📌', word: 'a note' },
  milestone: { emoji: '🗓️', word: 'a milestone' },
  milestone_photo: { emoji: '📷', word: 'a photo' },
  moment: { emoji: '📸', word: 'a moment' },
  photo: { emoji: '🌞', word: 'your day' },
  answer: { emoji: '💌', word: 'an answer' },
  card: { emoji: '🃏', word: 'a card' },
  compliment: { emoji: '💗', word: 'a compliment' },
  vault: { emoji: '🎁', word: 'a letter' },
}

function longAgo(years: number): string {
  if (years <= 1) return 'A year ago today'
  return `${years} years ago today`
}

export default function OnThisDay() {
  const { summary } = useSession()
  const [items, setItems] = useState<OnThisDayItem[]>([])
  const [before, setBefore] = useState<AnsweredBefore | null>(null)
  const [at, setAt] = useState(0)
  const [url, setUrl] = useState<string | null>(null)
  const [loaded, setLoaded] = useState(false)

  const partnerName = summary?.partner?.display_name ?? 'They'

  const load = useCallback(async () => {
    const [{ data }, { data: b }] = await Promise.all([
      supabase.rpc('on_this_day', { target: null }),
      supabase.rpc('answered_before'),
    ])
    setItems((data as OnThisDayItem[]) ?? [])
    setBefore(((b as AnsweredBefore[]) ?? [])[0] ?? null)
    setLoaded(true)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const item = items[at] ?? null

  // Media is a storage path; the bucket is private.
  useEffect(() => {
    if (!item?.media_path) return setUrl(null)
    void signedUrl(item.media_path).then(setUrl)
  }, [item?.media_path])

  if (!loaded || (items.length === 0 && !before)) return null

  return (
    <section className="space-y-3">
      {item && (
        <article className="animate-rise overflow-hidden rounded-3xl border border-rose-700/40 bg-gradient-to-br from-rose-900/50 to-rose-950 shadow-xl">
          {url && (
            <img
              src={url}
              alt=""
              className="max-h-64 w-full object-cover"
              loading="lazy"
            />
          )}

          <div className="p-5">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-wider text-pink-300 uppercase">
                <Emoji size={13}>{LABELS[item.kind]?.emoji ?? '✨'}</Emoji>
                {longAgo(item.years_ago)}
              </p>

              {/* Only worth showing when there is more than one. */}
              {items.length > 1 && (
                <div className="flex items-center gap-2 text-xs text-rose-400">
                  <button
                    onClick={() => setAt((i) => (i - 1 + items.length) % items.length)}
                    aria-label="Previous"
                    className="transition hover:text-rose-200"
                  >
                    ‹
                  </button>
                  <span className="tabular-nums">
                    {at + 1}/{items.length}
                  </span>
                  <button
                    onClick={() => setAt((i) => (i + 1) % items.length)}
                    aria-label="Next"
                    className="transition hover:text-rose-200"
                  >
                    ›
                  </button>
                </div>
              )}
            </div>

            {item.title && (
              <p className="text-sm font-bold text-white">{item.title}</p>
            )}
            {item.body && (
              <p
                className={cx(
                  'mt-1 leading-relaxed whitespace-pre-wrap text-rose-100',
                  item.body.length < 90 ? 'text-base italic' : 'text-sm',
                )}
              >
                {item.body}
              </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-3">
              <p className="text-[0.65rem] text-rose-500">
                {new Date(item.happened_on).toLocaleDateString(undefined, {
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
              </p>
              <Link
                to={`/${item.source}`}
                className="text-[0.65rem] font-semibold text-rose-400 transition hover:text-rose-200"
              >
                Open {LABELS[item.kind]?.word ?? 'it'} →
              </Link>
            </div>
          </div>
        </article>
      )}

      {/* The better half. Today's question, and what you both said last time. */}
      {before && (
        <article className="animate-rise rounded-3xl border border-pink-500/30 bg-pink-500/[0.06] p-5">
          <p className="text-[0.65rem] font-semibold tracking-wider text-pink-300 uppercase">
            You were asked this before ·{' '}
            {before.years_ago < 1
              ? `${Math.round(before.years_ago * 12)} months ago`
              : `${before.years_ago} years ago`}
          </p>
          <p className="mt-1.5 text-sm font-bold text-white">“{before.question}”</p>

          <div className="mt-3 space-y-2">
            {before.mine && (
              <div className="ml-6 rounded-2xl bg-gradient-to-br from-pink-600/70 to-rose-600/70 px-4 py-2.5">
                <p className="text-[0.6rem] tracking-wider text-rose-100/70 uppercase">
                  You, then
                </p>
                <p className="text-sm text-white">{before.mine}</p>
              </div>
            )}
            {before.theirs && (
              <div className="mr-6 rounded-2xl bg-rose-900/50 px-4 py-2.5">
                <p className="text-[0.6rem] tracking-wider text-rose-300/70 uppercase">
                  {partnerName}, then
                </p>
                <p className="text-sm text-rose-50">{before.theirs}</p>
              </div>
            )}
          </div>

          <p className="mt-3 text-[0.65rem] text-rose-400">
            Answer it again today and see what moved.
          </p>
        </article>
      )}
    </section>
  )
}
