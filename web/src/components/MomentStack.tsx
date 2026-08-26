import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { signedUrls } from '../lib/media'
import { ago } from '../lib/format'
import Reactions, { type ReactionRow, useReactionSet } from './Reactions'
import Compliments from './Compliments'
import { cx } from './ui'

type Moment = {
  id: string
  author_id: string
  storage_path: string
  caption: string | null
  expires_at: string | null
  created_at: string
}

/** "Disappears in 6h" — only worth saying while it's still true. */
function expiresIn(iso: string | null): string | null {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (ms <= 0) return null
  const hours = Math.floor(ms / 3_600_000)
  if (hours >= 1) return `Disappears in ${hours}h`
  return `Disappears in ${Math.max(1, Math.floor(ms / 60_000))}m`
}

/**
 * A swipeable stack of recent moments — one card at a time, the next peeking
 * behind it.
 *
 * Written with pointer events rather than a gesture library: the whole
 * interaction is a drag, a threshold and a spring back, and pulling in a
 * dependency for that would cost more than it saves.
 */
export default function MomentStack() {
  const { userId, summary } = useSession()
  const quickSet = useReactionSet()
  const [moments, setMoments] = useState<Moment[]>([])
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [reactions, setReactions] = useState<Record<string, ReactionRow[]>>({})
  const [index, setIndex] = useState(0)
  const [loading, setLoading] = useState(true)
  const [fullscreen, setFullscreen] = useState<Moment | null>(null)
  const [complimenting, setComplimenting] = useState<'send' | 'history' | null>(null)
  const [saving, setSaving] = useState<string | null>(null)

  // drag state
  const [dx, setDx] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [flying, setFlying] = useState(false)
  const startX = useRef(0)
  const startTime = useRef(0)

  const load = useCallback(async () => {
    const [{ data: rows, error: qErr }, { data: reacts }] = await Promise.all([
      supabase.from('moments').select('*').order('created_at', { ascending: false }).limit(20),
      supabase.from('reactions').select('target_id, emoji, user_id').eq('target_kind', 'moment'),
    ])

    // Table may not exist yet if 0017 has not run — stay silent rather than
    // breaking the whole home screen.
    if (qErr) {
      setLoading(false)
      return
    }

    const list = (rows as Moment[]) ?? []
    setMoments(list)
    setIndex((i) => Math.min(i, Math.max(0, list.length - 1)))

    const grouped: Record<string, ReactionRow[]> = {}
    for (const r of (reacts as { target_id: string; emoji: string; user_id: string }[]) ?? []) {
      ;(grouped[r.target_id] ??= []).push({ emoji: r.emoji, mine: r.user_id === userId })
    }
    setReactions(grouped)

    setUrls(await signedUrls(list.map((m) => m.storage_path)))
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void load()
  }, [load])

  /**
   * Throw the card off screen, then swap.
   *
   * It used to snap straight back to centre and change the photo underneath,
   * which made a committed swipe feel exactly like a failed one — the card
   * never went anywhere. Now it flies out in the direction you pushed it, and
   * the next card is already sitting behind.
   */
  function goto(next: number, direction: 1 | -1) {
    // Wrap around rather than dead-ending. With only a handful of moments,
    // hitting an invisible wall on the last card feels broken; looping keeps
    // the stack browsable in one direction.
    const wrapped =
      next < 0 ? moments.length - 1 : next >= moments.length ? 0 : next

    setFlying(true)
    setDx(direction * window.innerWidth)

    window.setTimeout(() => {
      // The card carries key={current.id}, so changing the index here mounts a
      // fresh node at centre. It used to be the same node with its transform
      // reset, which meant the incoming photo slid all the way back across the
      // screen from the side the last one left — half a second of the swap
      // visibly un-happening. Now the next card rises out of the stack instead.
      setIndex(wrapped)
      setFlying(false)
      setDx(0)
    }, 240)
  }

  function onPointerDown(e: React.PointerEvent) {
    if (flying) return
    // A drag that starts on a control belongs to that control. Without this,
    // selecting text in the reply box or holding a reaction dragged the whole
    // card sideways underneath you.
    if ((e.target as HTMLElement).closest('button, a, input, textarea, audio, video')) {
      return
    }
    setDragging(true)
    startX.current = e.clientX
    startTime.current = Date.now()
    ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!dragging) return
    setDx(e.clientX - startX.current)
  }

  function onPointerUp() {
    if (!dragging) return
    setDragging(false)

    // A flick counts even if it did not travel far — judging only by distance
    // made quick swipes feel like they were ignored.
    const elapsed = Date.now() - startTime.current
    const velocity = Math.abs(dx) / Math.max(elapsed, 1)
    const committed = Math.abs(dx) > 70 || velocity > 0.45

    if (!committed) {
      setDx(0)
      return
    }

    if (dx < 0) goto(index + 1, -1)
    else goto(index - 1, 1)
  }

  /**
   * Rescue a disappearing moment.
   *
   * Either of you can keep it — the person who received it usually has more
   * reason to than the one who sent it. Clearing expires_at is all it takes:
   * RLS stops hiding it and memories() starts including it again, so it
   * rejoins the normal moment → memory → album flow.
   */
  async function keepForever(id: string) {
    setSaving(id)
    await supabase.from('moments').update({ expires_at: null }).eq('id', id)
    setSaving(null)
    await load()
  }

  async function remove(id: string) {
    await supabase.from('moments').delete().eq('id', id)
    // Step back if the last card just went, so the index cannot dangle past
    // the end of the list.
    setIndex((i) => Math.max(0, Math.min(i, moments.length - 2)))
    await load()
  }

  async function quickReact(momentId: string, emoji: string) {
    await supabase.rpc('toggle_reaction', {
      kind: 'moment',
      target: momentId,
      emoji_char: emoji,
    })
    await load()
  }

  if (loading || moments.length === 0) return null

  const current = moments[index]
  // Wraps too, so the card behind is never empty on the last one — but only
  // when there is genuinely another photo, or it would peek at itself.
  const next = moments.length > 1 ? moments[(index + 1) % moments.length] : undefined
  const partnerName = summary?.partner?.display_name ?? 'They'
  const mine = current.author_id === userId
  const expiry = expiresIn(current.expires_at)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h3 className="text-xs font-bold tracking-wider text-rose-300 uppercase">
          📸 Moments
        </h3>
        <span className="text-xs text-rose-400">
          {index + 1} / {moments.length}
        </span>
      </div>

      <div className="relative" style={{ perspective: '1200px' }}>
        {/* the one behind, peeking */}
        {next && (
          <div
            aria-hidden
            className="absolute inset-x-0 top-0 overflow-hidden rounded-3xl border border-rose-700/30 bg-rose-900/40"
            style={{
              transform: `scale(${0.94 + Math.min(Math.abs(dx), 120) / 2000}) translateY(${
                12 - Math.min(Math.abs(dx), 120) / 12
              }px)`,
            }}
          >
            <div className="relative w-full overflow-hidden pt-[100%]">
              {urls[next.storage_path] && (
                <img
                  src={urls[next.storage_path]}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover opacity-50"
                />
              )}
            </div>
          </div>
        )}

        {/* the live card */}
        <div
          // Keyed on the photo: each swap is a new card, not the old one moved.
          key={current.id}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          className={cx(
            'relative touch-pan-y overflow-hidden rounded-3xl border border-pink-500/30 bg-rose-900/40 select-none',
            // While dragging the card must track the finger exactly, so no
            // transition. Flying out is quick and linear-ish; springing back
            // uses an overshooting curve so it feels elastic rather than stiff.
            !dragging &&
              (flying
                ? 'transition-[transform,opacity] duration-[240ms] ease-out'
                : 'transition-transform duration-500 [transition-timing-function:cubic-bezier(0.18,1.25,0.4,1)]'),
            // Arriving from the place the card behind was sitting, so the stack
            // reads as advancing by one rather than a photo simply changing.
            // Unconditional: the key above means this node is new every swap,
            // so it plays once per card rather than after every cancelled drag.
            'animate-card-settle',
          )}
          style={{
            transform: `translateX(${dx}px) rotate(${dx / 22}deg)`,
            opacity: flying ? 0 : 1,
            cursor: dragging ? 'grabbing' : 'grab',
          }}
        >
          {/* A square box with the image absolutely filling it. Relying on
              aspect-square plus object-cover on the img itself left a tall gap
              under wide photos, because the element kept its natural ratio. */}
          <div className="relative w-full overflow-hidden bg-rose-950/60 pt-[100%]">
            {urls[current.storage_path] ? (
              <img
                src={urls[current.storage_path]}
                alt={current.caption ?? ''}
                draggable={false}
                onClick={() => !dx && setFullscreen(current)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            ) : (
              <div className="absolute inset-0 grid place-items-center text-4xl">📸</div>
            )}
          </div>

          <div className="space-y-2 p-4">
            {current.caption && (
              <p className="text-sm text-rose-100">{current.caption}</p>
            )}

            <div className="flex items-center justify-between gap-2">
              <p className="text-xs text-rose-400">
                {mine ? 'You' : partnerName} · {ago(current.created_at)}
              </p>
              <div className="flex items-center gap-2">
                {expiry && (
                  <button
                    onClick={() => void keepForever(current.id)}
                    disabled={saving === current.id}
                    className="rounded-full bg-pink-500/20 px-2.5 py-1 text-[10px] font-semibold text-pink-200 transition hover:bg-pink-500/35 disabled:opacity-50"
                  >
                    {saving === current.id ? 'Keeping…' : `⏳ ${expiry} · Keep it`}
                  </button>
                )}
                {mine && (
                  <button
                    onClick={() => void remove(current.id)}
                    className="text-[11px] text-rose-500 transition-colors hover:text-rose-300"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* one-tap reactions, then the full picker */}
            <div className="flex items-center gap-1.5">
              {quickSet.slice(0, 3).map((emoji) => (
                <button
                  key={emoji}
                  onClick={() => void quickReact(current.id, emoji)}
                  className="rounded-full bg-rose-950/60 px-2.5 py-1 text-base transition hover:scale-110"
                >
                  {emoji}
                </button>
              ))}
              <div className="ml-auto">
                <Reactions
                  targetKind="moment"
                  targetId={current.id}
                  reactions={reactions[current.id] ?? []}
                  onChanged={load}
                  compact
                />
              </div>
            </div>

            {/* A compliment belongs on their face, not floating on a home
                screen — you say it because you are looking at them. */}
            {!mine && (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <button
                    onClick={() => setComplimenting('send')}
                    className="flex-1 rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-2.5 text-xs font-semibold text-white shadow transition hover:from-pink-500 hover:to-rose-500 active:scale-[0.98]"
                  >
                    Send a Compliment 💕
                  </button>
                  {/* A compliment sent from here used to vanish — the only
                      window onto them sat beside a trigger this card hides. */}
                  <button
                    onClick={() => setComplimenting('history')}
                    aria-label="Compliments you've sent and received"
                    className="rounded-2xl border border-rose-700/40 bg-rose-900/40 px-3 text-xs text-rose-200 transition hover:bg-rose-900"
                  >
                    💌
                  </button>
                </div>

                {/* Until now the only replies were an emoji or a preset. A
                    reply files into the one chat thread carrying this photo's
                    id, rather than starting a second per-photo comment system. */}
                <ReplyBox momentId={current.id} partnerName={partnerName} />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* dots */}
      {moments.length > 1 && (
        <div className="flex justify-center gap-1.5">
          {moments.slice(0, 10).map((m, i) => (
            <button
              key={m.id}
              onClick={() => goto(i, i > index ? -1 : 1)}
              aria-label={`Moment ${i + 1}`}
              className={cx(
                'h-1.5 rounded-full transition-all',
                i === index ? 'w-5 bg-pink-400' : 'w-1.5 bg-rose-700',
              )}
            />
          ))}
        </div>
      )}

      <Compliments
        open={complimenting !== null}
        view={complimenting ?? 'send'}
        onClose={() => setComplimenting(null)}
        hideTrigger
      />

      {/* fullscreen */}
      {fullscreen && (
        <div
          onClick={() => setFullscreen(null)}
          className="fixed inset-0 z-[60] grid place-items-center bg-black/90 p-4 backdrop-blur"
        >
          {urls[fullscreen.storage_path] && (
            <img
              src={urls[fullscreen.storage_path]}
              alt={fullscreen.caption ?? ''}
              className="max-h-[85dvh] w-auto rounded-2xl"
            />
          )}
          {fullscreen.caption && (
            <p className="mt-3 text-center text-sm text-rose-100">{fullscreen.caption}</p>
          )}
        </div>
      )}
    </div>
  )
}

/**
 * Reply to a photo without leaving it.
 *
 * The message carries the moment's id, so it lands in the one chat thread with
 * the picture attached rather than in a separate per-photo comment table. Reply
 * here, read it there.
 */
function ReplyBox({ momentId, partnerName }: { momentId: string; partnerName: string }) {
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function send() {
    const body = inputRef.current?.value.trim()
    if (!body || sending) return

    setSending(true)
    const { error } = await supabase.rpc('send_message', {
      message_body: body,
      about_moment: momentId,
      attachment_path: null,
      attachment_type: null,
      replying_to: null,
    })
    setSending(false)
    if (error) return

    if (inputRef.current) inputRef.current.value = ''
    setSent(true)
    window.setTimeout(() => setSent(false), 2400)
  }

  return (
    <div className="flex items-center gap-2">
      <input
        ref={inputRef}
        defaultValue=""
        maxLength={500}
        placeholder={sent ? 'Sent ✓' : `Reply to ${partnerName}…`}
        onKeyDown={(e) => e.key === 'Enter' && void send()}
        // Dragging inside the field would swipe the card away mid-sentence.
        onPointerDown={(e) => e.stopPropagation()}
        className="min-w-0 flex-1 rounded-full border border-rose-700/40 bg-rose-950/60 px-4 py-2 text-xs text-rose-50 placeholder-rose-400/60 focus:border-pink-500 focus:outline-none"
      />
      <button
        onClick={() => void send()}
        disabled={sending}
        aria-label="Send reply"
        onPointerDown={(e) => e.stopPropagation()}
        className="grid size-8 shrink-0 place-items-center rounded-full bg-rose-800/70 text-sm text-rose-100 transition active:scale-95 disabled:opacity-50"
      >
        ↑
      </button>
    </div>
  )
}
