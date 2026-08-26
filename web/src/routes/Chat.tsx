import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { signedUrls, uploadMedia, mediaTypeOf } from '../lib/media'
import { cx, ErrorNote, Loading } from '../components/ui'
import Reactions, { type ReactionRow } from '../components/Reactions'
import VoiceRecorder from '../components/VoiceRecorder'
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
 * A message that is only emoji, sent as a sticker would be.
 *
 * This is deliberately where the sticker feature ended up. Every GIF picker is
 * a third-party API — Giphy, Tenor — which would mean sending what the two of
 * you are talking about to a stranger's server on every keystroke. For an app
 * whose whole premise is that nobody else is watching, that is the wrong
 * trade. Big emoji costs nothing and leaks nothing.
 */
function isSticker(body: string | null): boolean {
  if (!body) return false
  const stripped = body.replace(/\s/g, '')
  if (stripped.length === 0) return false
  // Emoji, variation selectors and zero-width joiners only, and not many.
  if (!/^(\p{Extended_Pictographic}|️|‍|\p{Emoji_Modifier})+$/u.test(stripped)) {
    return false
  }
  return [...stripped.matchAll(/\p{Extended_Pictographic}/gu)].length <= 3
}

export default function Chat() {
  const { coupleId, userId, summary, refresh } = useSession()
  const [messages, setMessages] = useState<Message[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [reactions, setReactions] = useState<Record<string, ReactionRow[]>>({})
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState('')

  const [replyTo, setReplyTo] = useState<Message | null>(null)
  const [voice, setVoice] = useState<File | null>(null)
  const [recording, setRecording] = useState(false)
  const [showPins, setShowPins] = useState(false)
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [theyreTyping, setTheyreTyping] = useState(false)

  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  // The typing channel, plus the two timers that keep it honest: when we last
  // told them, and when to stop believing them.
  const typingChannel = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const toldThemAt = useRef(0)
  const stopBelieving = useRef<number | null>(null)
  // Uncontrolled: a controlled field re-rendered the whole thread on every
  // letter, which on iOS dropped focus and shut the keyboard mid-word.
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const partnerName = summary?.partner?.display_name ?? 'them'

  const load = useCallback(async () => {
    const [{ data, error: qErr }, { data: reacts }] = await Promise.all([
      supabase.from('messages').select('*').order('created_at', { ascending: true }).limit(500),
      supabase.from('reactions').select('target_id, emoji, user_id').eq('target_kind', 'message'),
    ])

    if (qErr) {
      setError(errorMessage(qErr))
      setLoading(false)
      return
    }

    const list = (data as Message[]) ?? []
    setMessages(list)
    setLoading(false)

    const grouped: Record<string, ReactionRow[]> = {}
    for (const r of (reacts as { target_id: string; emoji: string; user_id: string }[]) ?? []) {
      ;(grouped[r.target_id] ??= []).push({ emoji: r.emoji, mine: r.user_id === userId })
    }
    setReactions(grouped)

    // Attachments, plus the photos of any replies that hang off a moment.
    const paths = list.map((m) => m.media_path).filter(Boolean) as string[]
    const momentIds = [...new Set(list.map((m) => m.moment_id).filter(Boolean))] as string[]
    const momentPaths: Record<string, string> = {}

    if (momentIds.length > 0) {
      const { data: moments } = await supabase
        .from('moments')
        .select('id, storage_path')
        .in('id', momentIds)
      for (const r of (moments as { id: string; storage_path: string }[]) ?? []) {
        momentPaths[r.id] = r.storage_path
        paths.push(r.storage_path)
      }
    }

    const signed = await signedUrls(paths)
    // Keyed by both storage path and moment id, so either lookup works.
    setUrls({
      ...signed,
      ...Object.fromEntries(Object.entries(momentPaths).map(([id, p]) => [id, signed[p]])),
    })

    await supabase.rpc('mark_messages_read')
    await refresh()
  }, [refresh, userId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    if (!coupleId) return
    const channel = supabase
      .channel('chat')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'messages' },
        // Reload rather than patching in place: a message can arrive, be
        // pinned, be reacted to or be deleted, and reconciling four kinds of
        // change by hand is more code than one query.
        () => void load(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'reactions' },
        () => void load(),
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, load])

  /**
   * "…is typing".
   *
   * Broadcast, not a table. A keystroke is not worth a row, and it must not
   * survive the moment — writing it down would leave a record of someone
   * starting a message and thinking better of it, which is the opposite of
   * what this app is for. Nothing here is ever persisted.
   */
  useEffect(() => {
    if (!coupleId || !userId) return

    const channel = supabase
      .channel(`typing:${coupleId}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const from = payload as { userId?: string; typing?: boolean } | null
        if (!from || from.userId === userId) return

        setTheyreTyping(from.typing !== false)
        if (stopBelieving.current) window.clearTimeout(stopBelieving.current)

        // Their "stopped" can be lost — a closed tab, a dead network. Expire it
        // on our side too, or the dots would stay up all evening.
        if (from.typing !== false) {
          stopBelieving.current = window.setTimeout(() => setTheyreTyping(false), 5000)
        }
      })
      .subscribe()

    typingChannel.current = channel

    return () => {
      typingChannel.current = null
      if (stopBelieving.current) window.clearTimeout(stopBelieving.current)
      setTheyreTyping(false)
      void supabase.removeChannel(channel)
    }
  }, [coupleId, userId])

  function announceTyping(active: boolean) {
    const channel = typingChannel.current
    if (!channel) return

    const now = Date.now()
    // Re-announce at most every second or so while they keep typing; stopping
    // always goes out immediately.
    if (active && now - toldThemAt.current < 1200) return
    toldThemAt.current = active ? now : 0

    void channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { userId, typing: active },
    })
  }

  // A safety net under realtime. The socket is the fast path, but it can be
  // blocked by a network, dropped on a locked phone, or simply never connect —
  // and when that happened the thread only moved when the screen was reopened.
  // A quiet poll while the tab is in front costs one small query and means the
  // conversation always catches up on its own.
  useEffect(() => {
    if (!coupleId) return

    const tick = () => {
      if (document.visibilityState === 'visible') void load()
    }
    const timer = window.setInterval(tick, 15_000)
    document.addEventListener('visibilitychange', tick)

    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [coupleId, load])

  // useLayoutEffect, not useEffect: scrolling after paint makes the thread
  // visibly jump from the top on open.
  useLayoutEffect(() => {
    endRef.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, theyreTyping])

  async function send(attachment?: File) {
    const body = inputRef.current?.value.trim() ?? ''
    const file = attachment ?? voice
    if (!body && !file) return
    if (sending || !coupleId) return

    setSending(true)
    setError('')

    // Clear immediately. Waiting for the round trip made the field feel stuck
    // on a slow connection, and people retype into it.
    if (inputRef.current) {
      inputRef.current.value = ''
      inputRef.current.style.height = 'auto'
    }
    const quoted = replyTo?.id ?? null
    setReplyTo(null)
    setVoice(null)
    setRecording(false)
    // The message is on its way; the dots have done their job.
    announceTyping(false)

    try {
      let path: string | null = null
      let kind: string | null = null
      if (file) {
        path = (await uploadMedia(coupleId, 'chat', file)).path
        kind = mediaTypeOf(file)
      }

      const { data, error: rpcError } = await supabase.rpc('send_message', {
        message_body: body || null,
        about_moment: null,
        attachment_path: path,
        attachment_type: kind,
        replying_to: quoted,
      })
      if (rpcError) throw rpcError

      // Put it in the thread now, from the row the insert returned. This used
      // to wait for realtime to echo the message back — so when realtime was
      // not delivering, your own message stayed invisible until you left the
      // screen and came back. Nothing you have already sent should depend on a
      // socket to appear.
      const saved = data as Message | null
      if (saved) {
        setMessages((current) =>
          current.some((m) => m.id === saved.id) ? current : [...current, saved],
        )
      }
      // Then reconcile: signed URLs for an attachment, read receipts, badges.
      void load()
    } catch (err) {
      setError(errorMessage(err))
      // Give them their words back rather than losing them to an error.
      if (inputRef.current && body) inputRef.current.value = body
    } finally {
      setSending(false)
    }
  }

  async function remove(id: string) {
    setMenuFor(null)
    setMessages((current) => current.filter((m) => m.id !== id))
    await supabase.from('messages').delete().eq('id', id)
  }

  async function togglePin(id: string) {
    setMenuFor(null)
    await supabase.rpc('toggle_message_pin', { message_id: id })
    await load()
  }

  if (loading) return <Loading label="Opening…" />

  const pinned = messages.filter((m) => m.is_pinned)
  const byId = new Map(messages.map((m) => [m.id, m]))

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {pinned.length > 0 && (
        <div className="dark-glass sticky top-0 z-10 -mx-6 mb-2 border-b border-rose-800/40 px-6 py-2">
          <button
            onClick={() => setShowPins((v) => !v)}
            className="flex w-full items-center gap-2 text-left text-xs text-rose-300"
          >
            <span>📌</span>
            <span className="min-w-0 flex-1 truncate">
              {showPins ? 'Pinned' : (pinned[pinned.length - 1].body ?? 'An attachment')}
            </span>
            <span className="shrink-0 text-rose-500">{pinned.length}</span>
          </button>

          {showPins && (
            <ul className="mt-2 space-y-1.5">
              {pinned.map((m) => (
                <li key={m.id} className="flex items-start gap-2 text-xs text-rose-200">
                  <span className="min-w-0 flex-1 truncate">{m.body ?? 'An attachment'}</span>
                  <button
                    onClick={() => void togglePin(m.id)}
                    className="shrink-0 text-rose-500 hover:text-rose-300"
                  >
                    Unpin
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="flex-1 space-y-1 pb-4">
        {messages.length === 0 && (
          <div className="surface mt-8 p-8 text-center">
            <p className="text-3xl">💬</p>
            <p className="mt-3 text-sm text-ink">Nothing here yet.</p>
            <p className="mt-1 text-xs text-ink-faint">Say the first thing to {partnerName}.</p>
          </div>
        )}

        {messages.map((message, i) => {
          const mine = message.author_id === userId
          const previous = messages[i - 1]
          const newDay =
            !previous || dayLabel(previous.created_at) !== dayLabel(message.created_at)
          // Only start a new group when the run changes hands — a name on every
          // line makes a two-person thread look like a crowd.
          const startsRun = !previous || previous.author_id !== message.author_id
          const quoted = message.reply_to ? byId.get(message.reply_to) : null
          const sticker = isSticker(message.body) && !message.media_path
          const open = menuFor === message.id

          return (
            <div key={message.id}>
              {newDay && (
                <p className="py-4 text-center text-[0.65rem] tracking-wider text-ink-faint uppercase">
                  {dayLabel(message.created_at)}
                </p>
              )}

              <div className={cx('flex', mine ? 'justify-end' : 'justify-start')}>
                <div className={cx('max-w-[80%] min-w-0', startsRun && 'mt-2')}>
                  {/* a reply under a photo carries the photo */}
                  {message.moment_id && urls[message.moment_id] && (
                    <img
                      src={urls[message.moment_id]}
                      alt=""
                      className={cx(
                        'mb-1 h-24 w-24 rounded-2xl object-cover opacity-80',
                        mine && 'ml-auto',
                      )}
                    />
                  )}

                  <button
                    onClick={() => setMenuFor(open ? null : message.id)}
                    className={cx(
                      'block w-full rounded-3xl text-left transition',
                      sticker
                        ? 'px-1 py-0.5'
                        : mine
                          ? 'bg-gradient-to-br from-pink-600 to-rose-600 px-4 py-2.5 text-white'
                          : 'bg-rose-900/50 px-4 py-2.5 text-rose-50',
                    )}
                  >
                    {quoted && (
                      <span
                        className={cx(
                          'mb-1.5 block border-l-2 pl-2 text-xs',
                          mine ? 'border-pink-200/60 text-pink-100/80' : 'border-rose-600 text-rose-300',
                        )}
                      >
                        <span className="block truncate">
                          {quoted.body ?? 'An attachment'}
                        </span>
                      </span>
                    )}

                    {message.media_path && urls[message.media_path] && (
                      <span className="mb-1.5 block">
                        {message.media_type === 'photo' && (
                          <img
                            src={urls[message.media_path]}
                            alt=""
                            className="max-h-72 w-full rounded-2xl object-cover"
                          />
                        )}
                        {message.media_type === 'video' && (
                          <video
                            src={urls[message.media_path]}
                            controls
                            className="max-h-72 w-full rounded-2xl"
                          />
                        )}
                        {message.media_type === 'voice' && (
                          <audio src={urls[message.media_path]} controls className="w-56 max-w-full" />
                        )}
                      </span>
                    )}

                    {message.body && (
                      <span
                        className={cx(
                          'block break-words whitespace-pre-wrap',
                          sticker ? 'text-5xl leading-tight' : 'text-sm leading-relaxed',
                        )}
                      >
                        {message.body}
                      </span>
                    )}

                    {!sticker && (
                      <span className="mt-1 flex items-center justify-end gap-1.5">
                        {message.is_pinned && <span className="text-[0.6rem]">📌</span>}
                        <span
                          className={cx(
                            'text-[0.6rem]',
                            mine ? 'text-pink-100/70' : 'text-rose-400',
                          )}
                        >
                          {clockTime(message.created_at)}
                          {mine && message.read_at && ' · read'}
                        </span>
                      </span>
                    )}
                  </button>

                  {/* existing reactions sit under the bubble */}
                  {(reactions[message.id]?.length ?? 0) > 0 && (
                    <div className={cx('mt-0.5 flex', mine && 'justify-end')}>
                      <Reactions
                        targetKind="message"
                        targetId={message.id}
                        reactions={reactions[message.id] ?? []}
                        onChanged={load}
                        compact
                      />
                    </div>
                  )}

                  {open && (
                    <div
                      className={cx(
                        'mt-1 flex items-center gap-2 text-[0.65rem] text-rose-400',
                        mine && 'justify-end',
                      )}
                    >
                      <button
                        onClick={() => {
                          setReplyTo(message)
                          setMenuFor(null)
                          inputRef.current?.focus()
                        }}
                        className="hover:text-rose-200"
                      >
                        Reply
                      </button>
                      <button onClick={() => void togglePin(message.id)} className="hover:text-rose-200">
                        {message.is_pinned ? 'Unpin' : 'Pin'}
                      </button>
                      <Reactions
                        targetKind="message"
                        targetId={message.id}
                        reactions={reactions[message.id] ?? []}
                        onChanged={load}
                        compact
                      />
                      {mine && (
                        <button
                          onClick={() => void remove(message.id)}
                          className="text-red-400 hover:text-red-300"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}

        {theyreTyping && (
          <div className="flex justify-start">
            <div className="mt-2 flex items-center gap-1.5 rounded-3xl bg-rose-900/50 px-4 py-3">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="animate-typing-bounce size-1.5 rounded-full bg-rose-200"
                  style={{ animationDelay: `${i * 160}ms` }}
                />
              ))}
              <span className="sr-only">{partnerName} is typing</span>
            </div>
          </div>
        )}

        <div ref={endRef} />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      {/* Sticks to the bottom, and clears the home indicator on an installed
          PWA where the page runs under it. */}
      <div
        className="dark-glass sticky bottom-0 -mx-6 border-t border-rose-800/40 px-6 pt-3"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      >
        {replyTo && (
          <div className="mb-2 flex items-center gap-2 rounded-2xl bg-rose-950/60 px-3 py-2 text-xs text-rose-300">
            <span className="shrink-0">↩</span>
            <span className="min-w-0 flex-1 truncate">{replyTo.body ?? 'An attachment'}</span>
            <button onClick={() => setReplyTo(null)} className="shrink-0 text-rose-500">
              ✕
            </button>
          </div>
        )}

        {recording ? (
          <div className="mb-2">
            <VoiceRecorder
              onRecorded={(file) => {
                setVoice(file)
                if (file) void send(file)
              }}
              maxSeconds={180}
            />
            <button
              onClick={() => {
                setRecording(false)
                setVoice(null)
              }}
              className="mt-1 w-full text-center text-xs text-rose-400"
            >
              Cancel
            </button>
          </div>
        ) : (
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/*,video/*"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0]
                if (file) void send(file)
                e.target.value = ''
              }}
            />
            <button
              onClick={() => fileRef.current?.click()}
              aria-label="Send a photo or video"
              className="mb-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-rose-900/60 text-base text-rose-200 transition active:scale-95"
            >
              📷
            </button>
            <button
              onClick={() => setRecording(true)}
              aria-label="Record a voice message"
              className="mb-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-rose-900/60 text-base text-rose-200 transition active:scale-95"
            >
              🎙️
            </button>

            <textarea
              ref={inputRef}
              rows={1}
              maxLength={2000}
              placeholder={`Message ${partnerName}…`}
              onInput={(e) => {
                // Grow with the text, up to a point, so a long message is
                // visible while being written without swallowing the thread.
                const el = e.currentTarget
                el.style.height = 'auto'
                el.style.height = `${Math.min(el.scrollHeight, 140)}px`
                announceTyping(el.value.trim().length > 0)
              }}
              // Putting the phone down should take the dots down with it.
              onBlur={() => announceTyping(false)}
              onKeyDown={(e) => {
                // Enter sends on a keyboard; Shift+Enter makes a new line. On a
                // phone the on-screen return key inserts a line as usual.
                if (e.key === 'Enter' && !e.shiftKey && !/Mobi/i.test(navigator.userAgent)) {
                  e.preventDefault()
                  void send()
                }
              }}
              className="max-h-36 min-w-0 flex-1 resize-none rounded-3xl border border-rose-700/40 bg-rose-950/60 px-4 py-2.5 text-sm text-rose-50 placeholder-rose-400/50 focus:border-pink-500 focus:outline-none"
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
        )}
      </div>
    </div>
  )
}
