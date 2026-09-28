import { useEffect, useMemo, useRef, useState } from 'react'
import { cx } from './ui'
import Emoji from './Emoji'

/**
 * The emoji keyboard, ours.
 *
 * Every emoji the phone has — the whole Unicode set, the same 1,900-odd that
 * WhatsApp shows, in the same nine groups and the same order. A curated few
 * dozen was fine for picking a reaction and useless for writing a nudge, where
 * the exact one is the entire point.
 *
 * The table is bundled, not fetched: the app gets installed and opened on a
 * train with no signal, and an emoji list that arrives over the network is an
 * emoji list that isn't there when you need it. It is loaded on first open
 * rather than at startup, so it costs a chunk on demand and nothing on the
 * launch screen — the service worker precaches it either way.
 */

type Emoji = { emoji: string; name: string }
type Group = { key: string; tab: string; label: string; emoji: Emoji[] }

/** The nine Unicode groups, in Unicode's order — which is WhatsApp's order. */
const TABS: { slug: string; tab: string; label: string }[] = [
  { slug: 'smileys_emotion', tab: '😀', label: 'Smileys' },
  { slug: 'people_body', tab: '👋', label: 'People' },
  { slug: 'animals_nature', tab: '🐻', label: 'Nature' },
  { slug: 'food_drink', tab: '🍜', label: 'Food' },
  { slug: 'travel_places', tab: '🚗', label: 'Travel' },
  { slug: 'activities', tab: '⚽', label: 'Activities' },
  { slug: 'objects', tab: '💡', label: 'Objects' },
  { slug: 'symbols', tab: '✅', label: 'Symbols' },
  { slug: 'flags', tab: '🏳️', label: 'Flags' },
]

/** Loaded once per session and shared by every picker on the page. */
let cache: Group[] | null = null
let loading: Promise<Group[]> | null = null

async function loadGroups(): Promise<Group[]> {
  if (cache) return cache
  if (!loading) {
    loading = import('unicode-emoji-json/data-by-group.json').then((mod) => {
      const raw = (mod.default ?? mod) as unknown as Record<
        string,
        { slug: string; emojis: { emoji: string; name: string }[] }
      >

      const bySlug = new Map<string, { emoji: string; name: string }[]>()
      for (const group of Object.values(raw)) bySlug.set(group.slug, group.emojis)

      cache = TABS.map((t) => ({
        key: t.slug,
        tab: t.tab,
        label: t.label,
        emoji: (bySlug.get(t.slug) ?? []).map((e) => ({ emoji: e.emoji, name: e.name })),
      })).filter((g) => g.emoji.length > 0)

      return cache
    })
  }
  return loading
}

const RECENT_KEY = 'ours:recent-emoji'
const RECENT_MAX = 24

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY)
    return raw ? (JSON.parse(raw) as string[]).slice(0, RECENT_MAX) : []
  } catch {
    // A corrupt or unavailable store is not worth a broken picker.
    return []
  }
}

/** Call when one is chosen, so the next open starts with it to hand. */
export function rememberEmoji(emoji: string) {
  try {
    const next = [emoji, ...readRecent().filter((e) => e !== emoji)].slice(0, RECENT_MAX)
    localStorage.setItem(RECENT_KEY, JSON.stringify(next))
  } catch {
    /* no store, no recents — everything else still works */
  }
}

export default function EmojiPicker({
  value,
  onPick,
  className,
}: {
  value?: string
  onPick: (emoji: string) => void
  className?: string
}) {
  const [groups, setGroups] = useState<Group[] | null>(cache)
  const [tab, setTab] = useState(TABS[0].slug)
  const [query, setQuery] = useState('')
  const [recent, setRecent] = useState<string[]>(readRecent)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let live = true
    void loadGroups().then((g) => live && setGroups(g))
    return () => {
      live = false
    }
  }, [])

  // Switching category starts you at the top of it, not halfway down where the
  // last one happened to leave the scroll.
  useEffect(() => {
    gridRef.current?.scrollTo({ top: 0 })
  }, [tab, query])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q || !groups) return null

    // Matches at the start of the name first — typing "he" should reach "heart"
    // before "wheelchair". Two passes rather than a score, because the whole
    // table is under two thousand rows and this is cheaper than sorting it.
    const starts: Emoji[] = []
    const contains: Emoji[] = []
    for (const group of groups) {
      for (const e of group.emoji) {
        if (e.name.startsWith(q)) starts.push(e)
        else if (e.name.includes(q)) contains.push(e)
      }
    }
    return [...starts, ...contains]
  }, [query, groups])

  const current = groups?.find((g) => g.key === tab) ?? null
  const shown = results ?? current?.emoji ?? []

  function choose(emoji: string) {
    rememberEmoji(emoji)
    setRecent(readRecent())
    onPick(emoji)
  }

  return (
    <div
      className={cx(
        'overflow-hidden rounded-2xl border border-rose-700/40 bg-rose-950/60',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-b border-rose-800/40 p-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji…"
          className="min-w-0 flex-1 rounded-xl bg-rose-900/40 px-3 py-2 text-sm text-rose-50 placeholder-rose-400/50 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear search"
            className="px-1 text-rose-400 hover:text-rose-200"
          >
            ✕
          </button>
        )}
      </div>

      {!query && (
        <div className="scrollbar-none flex gap-0.5 overflow-x-auto border-b border-rose-800/40 px-1.5 py-1.5">
          {TABS.map((t) => (
            <button
              key={t.slug}
              onClick={() => setTab(t.slug)}
              aria-label={t.label}
              title={t.label}
              className={cx(
                'shrink-0 rounded-lg px-2 py-1.5 transition',
                tab === t.slug ? 'bg-pink-500/20' : 'opacity-50 hover:opacity-100',
              )}
            >
              <Emoji size={20}>{t.tab}</Emoji>
            </button>
          ))}
        </div>
      )}

      <div ref={gridRef} className="h-56 overflow-y-auto p-2">
        {!groups ? (
          <p className="p-6 text-center text-xs text-rose-400">Loading them all…</p>
        ) : (
          <>
            {!query && recent.length > 0 && (
              <>
                <Heading>Recent</Heading>
                <Grid emoji={recent} value={value} onPick={choose} />
                <Heading className="pt-3">{current?.label}</Heading>
              </>
            )}

            {shown.length === 0 ? (
              <p className="p-4 text-center text-xs text-rose-400">
                Nothing called “{query}”.
              </p>
            ) : (
              <Grid emoji={shown.map((e) => e.emoji)} value={value} onPick={choose} />
            )}
          </>
        )}
      </div>
    </div>
  )
}

function Heading({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cx(
        'px-1 pb-1 text-[10px] font-semibold tracking-wider text-rose-500 uppercase',
        className,
      )}
    >
      {children}
    </p>
  )
}

function Grid({
  emoji,
  value,
  onPick,
}: {
  emoji: string[]
  value?: string
  onPick: (emoji: string) => void
}) {
  return (
    <div className="grid grid-cols-8 gap-0.5">
      {emoji.map((e, i) => (
        <button
          key={`${e}-${i}`}
          onClick={() => onPick(e)}
          className={cx(
            'grid aspect-square place-items-center rounded-lg transition',
            value === e ? 'bg-pink-500/25 ring-1 ring-pink-500/60' : 'hover:bg-rose-900/60',
          )}
        >
          <Emoji size={24}>{e}</Emoji>
        </button>
      ))}
    </div>
  )
}
