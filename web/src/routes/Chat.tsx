import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { signedUrls } from '../lib/media'
import { cx, ErrorNote, Loading } from '../components/ui'
import type { Message } from '../lib/types'

/** Day separators, so a long thread does not become one undifferentiated wall. */
function dayLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)

  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Today'
  if (same(d, yesterday)) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
}

/**
 * Chat.
 *
 * The only replies in the app used to be an emoji or a preset compliment — you
 * could caption a photo and they could not write back. This is that missing
 * half.
 *
 * A message can carry a moment_id, which is what a reply under a photo becomes.
 * It stays one thread rather than a second per-photo comment system, so the
 * picture keeps flowing moment -> memory -> album untouched.
 */
export default function Chat() {
  const { userId, summary, refresh } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [thumbs, setThumbs] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const endRef = useRef<HTMLDivElement>(null)
  // Uncontrolled: a controlled field re-rendered the whole thread on every
  // letter, which on iOS dropped focus and shut the keyboard mid-word.
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const partnerName = summary?.partner?.display_name ?? 'them'

  const load = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('messages')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(500)

    if (qErr) {
      setError(errorMessage(qErr))
      setLoading(false)
      return
    }

    const list = (data as Message[]) ?? []
    setMessages(list)
    setLoading(false)

    // Photos for any replies that hang off a moment, so a reply reads with the
    // thing it is about rather than floating free.
    const momentIds = [...new Set(list.map((m) => m.moment_id).filter(Boolean))] as string[]
    if (momentIds.length > 0) {
      const { data: moments } = await supabase
        .from('moments')
        .select('id, storage_path')
        .in('id', momentIds)

      const rows = (moments as { id: string; storage_path: string }[]) ?? []
      const signed = await signedUrls(rows.map((r) => r.storage_path))
      setThumbs(Object.fromEntries(rows.map((r) => [r.id, signed[r.storage_path]])))
    }

    await supabase.rpc('mark_messages_read')
    await refresh()
  }, [refresh])

  useEffect(() => {
    void load()
  }, [load])

  // Live thread. Appending the row straight from the payload rather than
  // refetching keeps their message landing the instant they send it.
  useEffect(() => {
    const channel = supabase
      .channel('chat')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        ({ new: row }) => {
          const incoming = row as Message
          setMessages((current) =>
            current.some((m) => m.id === incoming.id) ? current : [...current, incoming],
          )
          if (incoming.author_id !== userId) {
            void supabase.rpc('mark_messages_read')
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'messages' },
        ({ old: row }) => {
          const gone = row as { id: string }
          setMessages((current) => current.filter((m) => m.id !== gone.id))
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [userId])

  // useLayoutEffect, not useEffect: scrolling after paint makes the thread
  // visibly jump from the top on open.
  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length])

  async function send() {
    const body = inputRef.current?.value.trim()
    if (!body || sending) return

    setSending(true)
    setError('')
    // Clear immediately. Waiting for the round trip made the field feel stuck
    // on a slow connection, and people retype into it.
    if (inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.style.height = 'auto'
    }

    const { error: rpcError } = await supabase.rpc('send_message', {
      message_body: body,
      about_moment: null,
    })

    setSending(false)
    if (rpcError) {
      setError(errorMessage(rpcError))
      // Give them their words back rather than losing them to an error.
      if (inputRef.current) inputRef.current.value = body
    }
  }

  async function remove(id: string) {
    setMessages((current) => current.filter((m) => m.id !== id))
    await supabase.from('messages').delete().eq('id', id)
  }

  if (loading) return <Loading label="Opening…" />

  return (
    // flex-1 with min-h-0 rather than h-full: the parent is a flex column, so
    // h-full resolves against nothing and the composer floats mid-page.
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex-1 space-y-1 pb-4">
        {messages.length === 0 && (
          <div className="surface mt-8 p-8 text-center">
            <p className="text-3xl">💬</p>
            <p className="mt-3 text-sm text-ink">Nothing here yet.</p>
            <p className="mt-1 text-xs text-ink-faint">
              Say the first thing to {partnerName}.
            </p>
          </div>
        )}

        {messages.map((message, i) => {
          const mine = message.author_id === userId
          const previous = messages[i - 1]
          const newDay =
            !previous || dayLabel(previous.created_at) !== dayLabel(message.created_at)
          // Only label the sender when the run changes hands — a name on every
          // line makes a two-person thread look like a crowd.
          const startsRun = !previous || previous.author_id !== message.author_id

          return (
            <div key={message.id}>
              {newDay && (
                <p className="py-4 text-center text-[0.65rem] tracking-wider text-ink-faint uppercase">
                  {dayLabel(message.created_at)}
                </p>
              )}

              <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[80%]', startsRun && 'mt-2')}>
                  {message.moment_id && thumbs[message.moment_id] && (
                    <img
                      src={thumbs[message.moment_id]}
                      alt=""
                      className={cx(
                        'mb-1 h-24 w-24 rounded-2xl object-cover opacity-80',
                        mine && 'ml-auto',
                      )}
                    />
                  )}

                  <div
                    className={cx(
                      'group rounded-3xl px-4 py-2.5',
                      mine
                        ? 'bg-gradient-to-br from-pink-600 to-rose-600 text-white'
                        : 'bg-rose-900/50 text-rose-50',
                    )}
                  >
                    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
                      {message.body}
                    </p>
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <span
                        className={cx(
                          'text-[0.6rem]',
                          mine ? 'text-pink-100/70' : 'text-rose-400',
                        )}
                      >
                        {clockTime(message.created_at)}
                        {mine && message.read_at && ' · read'}
                      </span>
                      {mine && (
                        <button
                          onClick={() => void remove(message.id)}
                          aria-label="Delete message"
                          className="text-[0.6rem] text-pink-100/50 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )
        })}

        <div ref={endRef} />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Sticks to the bottom above the nav bar, and clears the home indicator
          on an installed PWA where the page runs under it. */}
      <div
        className="dark-glass sticky bottom-0 -mx-6 flex items-end gap-2 border-t border-rose-800/40 px-6 pt-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        <textarea
          ref={inputRef}
          rows={1}
          maxLength={2000}
          placeholder={`Message ${partnerName}…`}
          onInput={(e) => {
            // Grow with the text, up to a point, so a long message is visible
            // while being written without swallowing the thread.
            const el = e.currentTarget
            el.style.height = 'auto'
            el.style.height = `${Math.min(el.scrollHeight, 140)}px`
          }}
          onKeyDown={(e) => {
            // Enter sends on a keyboard; Shift+Enter makes a new line. On a
            // phone the on-screen return key inserts a line as usual.
            if (e.key === 'Enter' && !e.shiftKey && !/Mobi/i.test(navigator.userAgent)) {
              e.preventDefault()
              void send()
            }
          }}
          className="max-h-36 flex-1 resize-none rounded-3xl border border-rose-700/40 bg-rose-950/60 px-4 py-2.5 text-sm text-rose-50 placeholder-rose-400/50 focus:border-pink-500 focus:outline-none"
        />
        <button
          onClick={() => void send()}
          disabled={sending}
          aria-label="Send"
          className="mb-0.5 grid size-11 shrink-0 place-items-center rounded-full bg-gradient-to-br from-pink-600 to-rose-600 text-white shadow transition active:scale-95 disabled:opacity-50"
        >
          ↑
        </button>
      </div>
    </div>
  )
}
