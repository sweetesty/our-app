import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { signedUrls, uploadMedia, mediaTypeOf } from '../lib/media'
import { cx, ErrorNote, Loading } from '../components/ui'
import Reactions, { type ReactionRow } from '../components/Reactions'
import VoiceRecorder from '../components/VoiceRecorder'
import type { Message } from '../lib/types'

/**
 * Composer icons.
 *
 * Drawn rather than typed. An emoji is a font glyph: 📷 and 🎙️ rendered as a
 * beige point-and-shoot and a grey studio mic on Android, sitting in a row of
 * pink controls and matching none of them. These inherit currentColor, so they
 * belong to whichever palette is on.
 */
function CameraIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M4 8.5h2.6l1.3-2.2a1 1 0 0 1 .86-.5h6.48a1 1 0 0 1 .86.5L17.4 8.5H20a1.5 1.5 0 0 1 1.5 1.5v7.5A1.5 1.5 0 0 1 20 19H4a1.5 1.5 0 0 1-1.5-1.5V10A1.5 1.5 0 0 1 4 8.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13.4" r="3.3" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  )
}

function MicIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" aria-hidden>
      <rect
        x="9"
        y="2.75"
        width="6"
        height="11"
        rx="3"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M5.5 11.2a6.5 6.5 0 0 0 13 0M12 17.7V21.2M8.75 21.25h6.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  )
}

/**
 * Drag a bubble sideways to answer it.
 *
 * Pointer events rather than a gesture library, the same as the moment stack:
 * this is a drag, a threshold and a spring back, and a dependency for that
 * would cost more than it saves.
 *
 * The fiddly part is telling a reply from a scroll. A thread is a vertical
 * list, so any ambiguity has to resolve as scrolling — the gesture only claims
 * the pointer once it has clearly gone sideways, and gives up for good the
 * moment it goes down.
 */
function SwipeToReply({
  onReply,
  children,
}: {
  onReply: () => void
  children: ReactNode
}) {
  const [dx, setDx] = useState(0)
  const [claimed, setClaimed] = useState(false)
  const start = useRef({ x: 0, y: 0 })
  const tracking = useRef(false)
  // A committed drag ends in a click on the bubble underneath. This swallows it
  // so answering a message does not also open its menu.
  const swallowClick = useRef(false)

  const PULL = 72
  const ENOUGH = 48

  function down(e: React.PointerEvent) {
    if ((e.target as HTMLElement).closest('audio, video, a')) return
    start.current = { x: e.clientX, y: e.clientY }
    tracking.current = true
  }

  function move(e: React.PointerEvent) {
    if (!tracking.current) return

    const raw = e.clientX - start.current.x
    const drop = Math.abs(e.clientY - start.current.y)

    if (!claimed) {
      // Going down the thread — hands off, permanently for this touch.
      if (drop > 10 && drop > Math.abs(raw)) {
        tracking.current = false
        return
      }
      if (raw < 10) return
      setClaimed(true)
      e.currentTarget.setPointerCapture?.(e.pointerId)
    }

    // One direction only, and heavier past the pull so it has an end.
    const d = Math.max(0, raw)
    setDx(d > PULL ? PULL + (d - PULL) * 0.16 : d)
  }

  function up() {
    if (!tracking.current) return
    tracking.current = false

    if (dx >= ENOUGH) {
      try {
        navigator.vibrate?.(14)
      } catch {
        // Not every phone offers one, and it is never worth an error.
      }
      onReply()
    }

    swallowClick.current = dx > 6
    setClaimed(false)
    setDx(0)
  }

  return (
    <div
      className="relative"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      onClickCapture={(e) => {
        if (!swallowClick.current) return
        swallowClick.current = false
        e.preventDefault()
        e.stopPropagation()
      }}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 grid place-items-center text-rose-300"
        style={{
          opacity: Math.min(1, dx / ENOUGH),
          transform: `translateX(${Math.min(dx, PULL) - 30}px) scale(${
            0.7 + Math.min(dx, ENOUGH) / ENOUGH / 3
          })`,
        }}
      >
        ↩
      </span>

      <div
        className={claimed ? undefined : 'transition-transform duration-300 ease-out'}
        style={{ transform: `translateX(${dx}px)` }}
      >
        {children}
      </div>
    </div>
  )
}

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
        <div className="dark-glass sticky top-0 z-10 -mx-4 mb-2 border-b border-rose-800/40 px-4 py-2 sm:-mx-6 sm:px-6">
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

                  <SwipeToReply
                    onReply={() => {
                      setReplyTo(message)
                      setMenuFor(null)
                      inputRef.current?.focus()
                    }}
                  >
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
                  </SwipeToReply>

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
          PWA where the page runs under it. The negative margin breaks it out
          of the page padding to sit edge to edge, so it has to track that
          padding — main is tighter on a phone than on a desktop, and a
          mismatch here pushed the composer wider than the screen. */}
      <div
        className="dark-glass sticky bottom-0 -mx-4 border-t border-rose-800/40 px-4 pt-3 sm:-mx-6 sm:px-6"
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
              className="mb-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-rose-900/60 text-rose-200 transition hover:bg-rose-800/70 hover:text-white active:scale-95"
            >
              <CameraIcon />
            </button>
            <button
              onClick={() => setRecording(true)}
              aria-label="Record a voice message"
              className="mb-0.5 grid size-10 shrink-0 place-items-center rounded-full bg-rose-900/60 text-rose-200 transition hover:bg-rose-800/70 hover:text-white active:scale-95"
            >
              <MicIcon />
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
