import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { ago } from '../lib/format'
import { cx } from './ui'
import type { Reply, ReplyKind } from '../lib/types'

/**
 * Writing back.
 *
 * Generic in the same way Reactions is: notes and vault letters share one
 * table and one component. An emoji says you read it; this is for the times
 * that is not enough — you have just been handed a letter written months ago
 * and you want to answer the person who wrote it.
 *
 * Loads its own thread rather than taking one as a prop, because the two
 * screens using it open one thing at a time.
 */
export default function Replies({
  kind,
  targetId,
  /** Whose words you are answering — used for the placeholder. */
  authorName,
  onChanged,
}: {
  kind: ReplyKind
  targetId: string
  authorName: string
  onChanged?: () => void | Promise<void>
}) {
  const { userId } = useSession()
  const [replies, setReplies] = useState<Reply[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('replies')
      .select('*')
      .eq('target_kind', kind)
      .eq('target_id', targetId)
      .order('created_at', { ascending: true })
    setReplies((data as Reply[]) ?? [])
  }, [kind, targetId])

  useEffect(() => {
    setDraft('')
    setError('')
    void load()
  }, [load])

  async function send() {
    const body = draft.trim()
    if (!body || busy) return
    setBusy(true)
    setError('')

    const { data, error: rpcError } = await supabase.rpc('send_reply', {
      kind,
      target: targetId,
      body,
    })

    setBusy(false)

    if (rpcError) {
      setError(errorMessage(rpcError))
      return
    }

    // From the row the insert returned, so it appears on the tap rather than
    // waiting on a second query.
    setDraft('')
    if (data) setReplies((current) => [...current, data as Reply])
    await onChanged?.()
  }

  async function remove(id: string) {
    setReplies((current) => current.filter((r) => r.id !== id))
    await supabase.from('replies').delete().eq('id', id)
    await onChanged?.()
  }

  return (
    <div className="space-y-3 border-t border-rose-800/40 pt-4">
      {replies.length > 0 && (
        <ul className="space-y-2">
          {replies.map((r) => {
            const mine = r.author_id === userId
            return (
              <li
                key={r.id}
                className={cx(
                  'animate-rise rounded-2xl px-3.5 py-2.5',
                  mine
                    ? 'ml-6 bg-gradient-to-br from-pink-600/80 to-rose-600/80 text-white'
                    : 'mr-6 bg-rose-900/50 text-rose-50',
                )}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{r.body}</p>
                <p className="mt-1 flex items-center gap-2 text-[0.65rem] text-rose-200/70">
                  <span>
                    {mine ? 'You' : authorName} · {ago(r.created_at)}
                  </span>
                  {mine && (
                    <button
                      onClick={() => void remove(r.id)}
                      className="text-rose-200/70 underline-offset-2 hover:underline"
                    >
                      Delete
                    </button>
                  )}
                </p>
              </li>
            )
          })}
        </ul>
      )}

      <div className="flex items-end gap-2">
        <textarea
          rows={1}
          value={draft}
          maxLength={1000}
          onChange={(e) => {
            setDraft(e.target.value)
            e.target.style.height = 'auto'
            e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !/Mobi/i.test(navigator.userAgent)) {
              e.preventDefault()
              void send()
            }
          }}
          placeholder={replies.length > 0 ? 'Say something else…' : `Write back to ${authorName}…`}
          className="max-h-32 min-w-0 flex-1 resize-none rounded-2xl border border-rose-700/40 bg-rose-950/60 px-4 py-2.5 text-sm text-rose-50 placeholder-rose-400/50 focus:border-pink-500 focus:outline-none"
        />
        <button
          onClick={() => void send()}
          disabled={busy || !draft.trim()}
          aria-label="Send reply"
          className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-600 to-rose-600 text-white shadow transition active:scale-95 disabled:opacity-40"
        >
          ↑
        </button>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
    </div>
  )
}
