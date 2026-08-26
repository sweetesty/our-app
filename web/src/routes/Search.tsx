import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errorMessage } from '../lib/supabase'
import { signedUrls } from '../lib/media'
import { cx, ErrorNote, PageHeader } from '../components/ui'
import { when } from '../lib/format'

type Hit = {
  id: string
  kind: string
  title: string | null
  snippet: string | null
  media_path: string | null
  source: string
  source_id: string
  created_at: string
}

/** Where each kind of hit lives, so a result can be opened rather than just read. */
const DESTINATION: Record<string, string> = {
  notes: '/notes',
  chat: '/chat',
  timeline: '/timeline',
  moments: '/moments',
  cards: '/memories',
  today: '/',
  vault: '/vault',
  compliments: '/memories',
  daily: '/',
}

const ICON: Record<string, string> = {
  note: '💌',
  message: '💬',
  milestone: '🗓️',
  moment: '📸',
  card: '🃏',
  answer: '✨',
  vault: '🔒',
  compliment: '💕',
  photo: '📷',
}

const LABEL: Record<string, string> = {
  note: 'Note',
  message: 'Chat',
  milestone: 'Timeline',
  moment: 'Moment',
  card: 'Card',
  answer: 'Answer',
  vault: 'Vault',
  compliment: 'Compliment',
  photo: 'Our day',
}

/**
 * One box over the whole app.
 *
 * The gates are enforced inside search_everything() rather than here: an
 * unrevealed answer, a sealed surprise and an expired moment never reach this
 * screen at all. A search box that quietly bypassed the rules would be the way
 * round every one of them.
 */
export default function Search() {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<Hit[] | null>(null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const run = useCallback(async (term: string) => {
    const trimmed = term.trim()
    if (trimmed.length < 2) {
      setHits(null)
      return
    }

    setBusy(true)
    const { data, error: rpcError } = await supabase.rpc('search_everything', {
      q: trimmed,
      limit_count: 60,
    })
    setBusy(false)

    if (rpcError) {
      setError(errorMessage(rpcError))
      return
    }

    setError('')
    const rows = (data as Hit[]) ?? []
    setHits(rows)

    const paths = rows.map((r) => r.media_path).filter(Boolean) as string[]
    if (paths.length > 0) setUrls(await signedUrls(paths))
  }, [])

  // Debounced: a query per keystroke would be a round trip per letter, and the
  // results flicker faster than anyone can read them.
  useEffect(() => {
    const timer = window.setTimeout(() => void run(query), 300)
    return () => window.clearTimeout(timer)
  }, [query, run])

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  return (
    <>
      <PageHeader eyebrow="Everything" title="Search">
        Notes, chat, cards, timeline, photos, letters — all of it at once.
      </PageHeader>

      <div className="relative mb-4">
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-rose-400">
          🔎
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="birthday, that night, the beach…"
          className="w-full rounded-full border border-rose-700/40 bg-rose-950/60 py-3 pr-10 pl-11 text-sm text-rose-50 placeholder-rose-400/50 focus:border-pink-500 focus:outline-none"
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            aria-label="Clear"
            className="absolute top-1/2 right-4 -translate-y-1/2 text-rose-400 hover:text-rose-200"
          >
            ✕
          </button>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {hits === null ? (
        <p className="mt-10 text-center text-sm text-ink-faint">
          {busy ? 'Looking…' : 'Type at least two letters.'}
        </p>
      ) : hits.length === 0 ? (
        <div className="surface mt-8 p-8 text-center">
          <p className="text-3xl">🔎</p>
          <p className="mt-3 text-sm text-ink">Nothing matches “{query.trim()}”.</p>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-ink-faint">
            {hits.length} {hits.length === 1 ? 'thing' : 'things'}
          </p>
          <ul className="space-y-2">
            {hits.map((hit) => (
              <li key={`${hit.source}-${hit.id}`}>
                <Link
                  to={DESTINATION[hit.source] ?? '/'}
                  className="flex items-start gap-3 rounded-2xl border border-rose-800/40 bg-rose-900/25 p-3.5 transition hover:border-pink-500/40"
                >
                  {hit.media_path && urls[hit.media_path] ? (
                    <img
                      src={urls[hit.media_path]}
                      alt=""
                      className="size-11 shrink-0 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-rose-950/60 text-lg">
                      {ICON[hit.kind] ?? '•'}
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline gap-2">
                      <span className="truncate text-sm font-semibold text-white">
                        {hit.title}
                      </span>
                      <span className="shrink-0 text-[0.6rem] tracking-wide text-rose-400 uppercase">
                        {LABEL[hit.kind] ?? hit.kind}
                      </span>
                    </span>
                    {hit.snippet && (
                      <span className={cx('mt-0.5 block text-xs leading-relaxed text-rose-300')}>
                        <Highlight text={hit.snippet} term={query.trim()} />
                      </span>
                    )}
                    <span className="mt-1 block text-[0.6rem] text-rose-500">
                      {when(hit.created_at)}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  )
}

/** Shows why a result matched, and trims around the match rather than the start. */
function Highlight({ text, term }: { text: string; term: string }) {
  const at = text.toLowerCase().indexOf(term.toLowerCase())
  if (at < 0) return <>{text.slice(0, 120)}</>

  const from = Math.max(0, at - 40)
  const before = (from > 0 ? '…' : '') + text.slice(from, at)
  const match = text.slice(at, at + term.length)
  const after = text.slice(at + term.length, at + term.length + 80)

  return (
    <>
      {before}
      <mark className="rounded bg-pink-500/30 px-0.5 text-rose-50">{match}</mark>
      {after}
      {text.length > at + term.length + 80 && '…'}
    </>
  )
}
