import { useCallback, useEffect, useRef, useState } from 'react'
import confetti from 'canvas-confetti'
import { supabase, errorMessage } from '../../lib/supabase'
import { useSession } from '../../context/SessionProvider'
import { cx, Loading } from '../ui'
import { WhotFace, WhotBack, Shape } from './WhotCardArt'
import { useBoardRefresh } from './useBoardRefresh'
import WhotRulesModal from './WhotRulesModal'
import WhotChatDrawer from './WhotChatDrawer'
import FlyingCardOverlay, { type FlightMotion } from './FlyingCardOverlay'
import {
  isWhotSoundEnabled,
  setWhotSoundEnabled,
  playCardSnap,
  playMarketDraw,
  playSpecialWhoosh,
  playVictoryFanfare,
} from './whotAudio'
import type { WhotCard, WhotView } from '../../lib/types'

const SHAPE_NAMES = ['circle', 'triangle', 'cross', 'square', 'star'] as const

type BigAnnouncement = {
  title: string
  subtitle?: string
}

export default function Whot({ onBack }: { onBack: () => void }) {
  const { coupleId, summary } = useSession()
  const [matchId, setMatchId] = useState<string | null>(null)
  const [view, setView] = useState<WhotView | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  /** Index of the Whot 20 card waiting for the player to select a shape */
  /**
   * The Whot card awaiting a shape, held as the card itself rather than its
   * position in the hand. A position goes stale the moment the hand changes —
   * and it can, while the picker is open: their General Market deals you one,
   * everything shifts, and the index you stored is now a different card.
   */
  const [calling, setCalling] = useState<WhotCard | null>(null)
  const [errorToast, setErrorToast] = useState<string | null>(null)
  const [announcement, setAnnouncement] = useState<string>('Welcome to Whot! Tap a lifted card to play')
  const [bigAnnouncement, setBigAnnouncement] = useState<BigAnnouncement | null>(null)
  const [showRules, setShowRules] = useState(false)
  const [showChat, setShowChat] = useState(false)
  const [soundOn, setSoundOn] = useState(() => isWhotSoundEnabled())
  const [turnSeconds, setTurnSeconds] = useState(35)

  // Card flight animations
  const [flights, setFlights] = useState<FlightMotion[]>([])
  const discardPileRef = useRef<HTMLDivElement>(null)
  const marketPileRef = useRef<HTMLDivElement>(null)
  const opponentFanRef = useRef<HTMLDivElement>(null)
  const handCardRefs = useRef<(HTMLDivElement | null)[]>([])

  // House rules chosen before deal
  // Default to NO STACKING as requested by user
  const [stacking, setStacking] = useState(false)
  const [marketOut, setMarketOut] = useState<'rollover' | 'count'>('rollover')
  const [showModeSelect, setShowModeSelect] = useState(false)

  const myName = summary?.me?.display_name ?? 'You'
  const partnerName = summary?.partner?.display_name ?? 'Partner'

  // Big announcement trigger helper
  const bigAnnouncementTimerRef = useRef<number | null>(null)
  const triggerBigAnnouncement = useCallback((title: string, subtitle?: string) => {
    if (bigAnnouncementTimerRef.current) clearTimeout(bigAnnouncementTimerRef.current)
    setBigAnnouncement({ title, subtitle })
    bigAnnouncementTimerRef.current = window.setTimeout(() => {
      setBigAnnouncement(null)
    }, 2800)
  }, [])

  // Turn timer countdown
  useEffect(() => {
    if (!view || view.winner) return
    setTurnSeconds(35)
    const interval = window.setInterval(() => {
      setTurnSeconds((s) => (s > 0 ? s - 1 : 0))
    }, 1000)
    return () => clearInterval(interval)
  }, [view])

  // Sound toggle
  function toggleSound() {
    const next = !soundOn
    setSoundOn(next)
    setWhotSoundEnabled(next)
  }

  // Flash a notification banner
  const toastTimeoutRef = useRef<number | null>(null)
  const notify = useCallback((msg: string, isErr = false) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current)
    if (isErr) {
      setErrorToast(msg)
      toastTimeoutRef.current = window.setTimeout(() => setErrorToast(null), 4000)
    } else {
      setAnnouncement(msg)
    }
  }, [])

  const read = useCallback(async (id: string) => {
    const { data, error: rpcError } = await supabase.rpc('whot_view', { match: id })
    if (rpcError) {
      notify(errorMessage(rpcError), true)
      return
    }
    const nextView = ((data as WhotView[]) ?? [])[0] ?? null
    setView(nextView)
  }, [notify])

  const find = useCallback(async () => {
    const table = () => supabase.from('board_matches').select('id').eq('game', 'whot')

    // Open game first; otherwise the last finished one, so the result stays
    // up until somebody deals again. Looking only for an unfinished match
    // meant a reload after a loss dropped you straight on the new-game
    // screen, and you never found out your partner had checked up.
    let { data } = await table().is('finished_at', null).maybeSingle()
    if (!data) {
      const last = await table()
        .not('finished_at', 'is', null)
        .order('finished_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      data = last.data
    }

    const id = (data as { id: string } | null)?.id ?? null
    setMatchId(id)
    if (id) await read(id)
    setLoading(false)
  }, [read])

  useEffect(() => {
    void find()
  }, [find])

  useBoardRefresh(find)

  // Realtime subscription for moves made by either player
  useEffect(() => {
    if (!coupleId) return
    const channel = supabase
      .channel(`whot-${coupleId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'board_matches',
          filter: `couple_id=eq.${coupleId}`,
        },
        (payload) => {
          const row = payload.new as { id: string; game: string }
          if (row?.game === 'whot') {
            void read(row.id)
          }
        },
      )
      .subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [coupleId, read])

  // Track previous turn/top card to trigger sound and big announcements
  const prevTopRef = useRef<string | null>(null)
  const prevWinnerRef = useRef<string | null>(null)
  const prevMarketRef = useRef<number | null>(null)
  /**
   * How many cards were in my hand last time. Whose turn it is cannot tell you
   * who just played: Hold On and Suspension both leave the turn where it was,
   * so after playing a 1 the screen announced that your partner had done it.
   * A hand that shrank is the only honest signal that the card was yours.
   */
  const prevMyCountRef = useRef<number | null>(null)

  useEffect(() => {
    if (!view) return

    // Market draw detection
    if (prevMarketRef.current !== null && view.market < prevMarketRef.current) {
      const whoDrew = view.my_turn ? partnerName : myName
      notify(`@${whoDrew}: Went to market`)
    }
    prevMarketRef.current = view.market

    // Winning celebration
    if (view.winner && view.winner !== prevWinnerRef.current) {
      prevWinnerRef.current = view.winner
      playVictoryFanfare()
      void confetti({
        particleCount: 100,
        spread: 80,
        origin: { y: 0.6 },
      })
      const winnerName = view.winner === view.seat ? myName : partnerName
      notify(`@${winnerName}: Check up! 🎉`)
      triggerBigAnnouncement('CHECK UP! 🎉', `@${winnerName} emptied their hand and won!`)
      return
    }

    // Top card change announcement
    const topKey = view.top ? `${view.top.s}-${view.top.n}-${view.called ?? ''}` : null
    if (topKey && topKey !== prevTopRef.current) {
      prevTopRef.current = topKey
      if (view.top) {
        const iPlayedIt =
          prevMyCountRef.current !== null && view.my_count < prevMyCountRef.current
        const actor = iPlayedIt ? 'You' : `@${partnerName}`
        const target = iPlayedIt ? `@${partnerName}` : 'You'

        if (view.top.s === 'whot' || view.top.n === 20) {
          playSpecialWhoosh()
          const shapeWord = view.called ? `${view.called}s` : 'a shape'
          notify(`${actor}: Whot! I need ${shapeWord}`)
          triggerBigAnnouncement('WHOT!', `I need ${view.called?.toUpperCase() ?? ''}`)
        } else if (view.top.n === 2) {
          playSpecialWhoosh()
          notify(`${actor}: Pick two! 2 for the next player`)
          triggerBigAnnouncement('PICK TWO!', `${actor} → ${target} picks 2`)
        } else if (view.top.n === 5) {
          playSpecialWhoosh()
          notify(`${actor}: Pick three! 3 for the next player`)
          triggerBigAnnouncement('PICK THREE!', `${actor} → ${target} picks 3`)
        } else if (view.top.n === 1) {
          playSpecialWhoosh()
          notify(`${actor}: Hold on! Play again`)
          triggerBigAnnouncement('HOLD ON!', `${actor} plays again`)
        } else if (view.top.n === 8) {
          playSpecialWhoosh()
          notify(`${actor}: Suspension! Turn skipped`)
          triggerBigAnnouncement('SUSPENSION!', `${target} misses their turn`)
        } else if (view.top.n === 14) {
          playSpecialWhoosh()
          notify(`${actor}: General market! Everyone picks one`)
          triggerBigAnnouncement('GENERAL MARKET!', 'Everyone else picks one')
        } else {
          playCardSnap()
        }
      }
    }

    // Announce last card / check
    if (view.my_count === 1) {
      notify('You: Last Card! ⚠️')
    } else if (view.their_count === 1) {
      notify(`@${partnerName}: Last Card! ⚠️`)
    } else if (view.my_count === 2) {
      notify('You: Check! ⚠️')
    } else if (view.their_count === 2) {
      notify(`@${partnerName}: Check! ⚠️`)
    }
    prevMyCountRef.current = view.my_count
  }, [view, myName, partnerName, notify, triggerBigAnnouncement])

  /** Spawn card flight from hand to discard pile */
  const triggerPlayFlight = (card: WhotCard, cardIndex: number) => {
    const cardEl = handCardRefs.current[cardIndex]
    const pileEl = discardPileRef.current

    if (cardEl && pileEl) {
      const cardRect = cardEl.getBoundingClientRect()
      const pileRect = pileEl.getBoundingClientRect()

      const flightId = `${Date.now()}-${Math.random()}`
      const newFlight: FlightMotion = {
        id: flightId,
        card,
        startRect: {
          left: cardRect.left,
          top: cardRect.top,
          width: cardRect.width,
          height: cardRect.height,
        },
        endRect: {
          left: pileRect.left,
          top: pileRect.top,
          width: pileRect.width,
          height: pileRect.height,
        },
        startRotate: 0,
        endRotate: Math.random() * 18 - 9,
        durationMs: 400,
        onComplete: () => {
          setFlights((curr) => curr.filter((f) => f.id !== flightId))
          playCardSnap()
        },
      }

      setFlights((curr) => [...curr, newFlight])
    }
  }

  /** Spawn card flight from market to hand */
  const triggerMarketFlight = () => {
    const marketEl = marketPileRef.current
    if (marketEl) {
      const marketRect = marketEl.getBoundingClientRect()
      const flightId = `${Date.now()}-${Math.random()}`

      const newFlight: FlightMotion = {
        id: flightId,
        isBack: true,
        startRect: {
          left: marketRect.left,
          top: marketRect.top,
          width: marketRect.width,
          height: marketRect.height,
        },
        endRect: {
          left: window.innerWidth / 2 - 40,
          top: window.innerHeight - 130,
          width: marketRect.width,
          height: marketRect.height,
        },
        startRotate: 0,
        endRotate: 0,
        durationMs: 360,
        onComplete: () => {
          setFlights((curr) => curr.filter((f) => f.id !== flightId))
          playMarketDraw()
        },
      }

      setFlights((curr) => [...curr, newFlight])
    }
  }

  async function start(chosenMarketOut = marketOut) {
    if (matchId && view && !view.winner) {
      notify('A Whot game is already in progress! You must finish or resign before dealing a new Whot game.', true)
      return
    }

    setBusy(true)
    setErrorToast(null)
    setShowModeSelect(false)

    const { data, error: rpcError } = await supabase.rpc('start_board', {
      game_name: 'whot',
      opts: { stacking, market_out: chosenMarketOut },
    })
    setBusy(false)
    if (rpcError) return notify(errorMessage(rpcError), true)
    const id = data as string
    setMatchId(id)
    playMarketDraw()
    notify(`Cards dealt under ${chosenMarketOut === 'count' ? 'Count Rules' : 'Rollover Rules'}! 🃏`)
    await read(id)
  }

  async function play(at: number, shape?: string) {
    if (!matchId || busy) return

    const cardToPlay = view?.my_hand?.[at]
    if (cardToPlay) {
      triggerPlayFlight(cardToPlay, at)
    }

    setBusy(true)
    setErrorToast(null)

    if (shape) {
      playSpecialWhoosh()
      notify(`Called ${shape.toUpperCase()} ✨`)
    }

    const { error: rpcError } = await supabase.rpc('whot_play', {
      match: matchId,
      card_at: at,
      call_shape: shape ?? null,
    })

    setBusy(false)
    setCalling(null)

    if (rpcError) {
      notify(errorMessage(rpcError), true)
      return
    }

    await read(matchId)
  }

  async function market() {
    if (!matchId || busy) return
    triggerMarketFlight()
    setBusy(true)
    setErrorToast(null)

    const { error: rpcError } = await supabase.rpc('whot_market', { match: matchId })
    setBusy(false)

    if (rpcError) {
      notify(errorMessage(rpcError), true)
      return
    }

    notify(view?.pending ? `Picked ${view.pending} from market` : 'Picked from market 🛒')
    await read(matchId)
  }

  function clear() {
    // Reset local state to choose rules for the next deal without deleting match history
    setMatchId(null)
    setView(null)
    prevTopRef.current = null
    prevWinnerRef.current = null
    setShowModeSelect(true)
  }

  async function resign() {
    if (!matchId || busy) return
    const confirmed = window.confirm(
      `Concede this game to @${partnerName}? They will be awarded the win and this game will end.`
    )
    if (!confirmed) return

    setBusy(true)
    setErrorToast(null)
    const { error: rpcError } = await supabase.rpc('resign_board', { match: matchId })
    setBusy(false)
    if (rpcError) {
      notify(errorMessage(rpcError), true)
      return
    }
    notify(`You resigned. @${partnerName} won! 🏳️`)
    await read(matchId)
  }

  if (loading) return <Loading label="Shuffling deck…" />

  /* =========================================================================
     1. NO MATCH ACTIVE (OR USER CLICKED NEW DEAL TO CHOOSE BETWEEN THE 2 RULES)
     Only allowed when there is no active game currently in progress!
     ========================================================================= */
  const isGameInProgress = !!(matchId && view && !view.winner)
  if (!isGameInProgress && (!matchId || !view || showModeSelect)) {
    return (
      <div className="mx-auto max-w-md space-y-4 px-2 py-2 text-white">
        {/* Top bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={showModeSelect && view?.winner ? () => setShowModeSelect(false) : onBack}
            className="flex items-center gap-1.5 text-xs font-semibold text-rose-300 transition hover:text-white"
          >
            ← {showModeSelect && view?.winner ? 'Back to Table' : 'Games'}
          </button>
          <button
            onClick={() => setShowRules(true)}
            className="rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-bold text-amber-300 transition hover:bg-amber-500/20"
          >
            House Rules
          </button>
        </div>

        {errorToast && (
          <div className="rounded-xl border border-red-500/40 bg-red-950/80 p-3 text-center text-xs font-semibold text-red-200">
            {errorToast}
          </div>
        )}

        {/* Felt Table Preview Card */}
        <div
          className="relative overflow-hidden rounded-[2.5rem] border-[6px] border-[#8A572A] p-6 text-center shadow-[0_20px_45px_rgba(0,0,0,0.8),inset_0_0_28px_rgba(0,0,0,0.6)]"
          style={{
            background:
              'radial-gradient(ellipse at 50% 35%, #185A37 0%, #0D3822 65%, #072516 100%)',
          }}
        >
          {/* Card fan preview */}
          <div className="mb-4 flex justify-center items-center -space-x-4">
            <span className="-rotate-12 transform scale-90">
              <WhotBack small />
            </span>
            <span className="z-10 transform scale-100">
              <WhotFace card={{ s: 'whot', n: 20 }} small flat />
            </span>
            <span className="rotate-12 transform scale-90">
              <WhotBack small />
            </span>
          </div>

          <h1 className="text-2xl font-black tracking-tight text-white drop-shadow-md">
            Whot! <span className="text-amber-400">🔥</span>
          </h1>
          <p className="mx-auto mt-1 max-w-xs text-xs text-emerald-200/90 leading-relaxed font-medium">
            Choose which house rule you want applied for this game:
          </p>

          {/* THE TWO RULES CHOICE (Matching user requirement) */}
          <div className="mt-5 space-y-3 text-left">
            <p className="text-[0.68rem] font-extrabold tracking-wider text-amber-300 uppercase">
              Select Game Mode
            </p>

            <div className="grid grid-cols-1 gap-2.5">
              {/* Option 1: Rollover Rules */}
              <button
                type="button"
                onClick={() => setMarketOut('rollover')}
                className={cx(
                  'rounded-2xl border p-3.5 text-left transition relative cursor-pointer',
                  marketOut === 'rollover'
                    ? 'border-amber-400 bg-amber-400/20 shadow-lg ring-2 ring-amber-400'
                    : 'border-emerald-800/60 bg-emerald-950/40 hover:bg-emerald-900/40',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>🔁</span> Rollover Mode
                  </span>
                  {marketOut === 'rollover' && (
                    <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[0.62rem] font-black text-stone-950 uppercase">
                      Selected
                    </span>
                  )}
                </div>
                <p className="text-xs text-emerald-200/90 mt-1 leading-snug">
                  When the market runs out, played cards shuffle into a new market and play goes on. Empty your hand to win (<strong>Check up!</strong>).
                </p>
              </button>

              {/* Option 2: Count Rules */}
              <button
                type="button"
                onClick={() => setMarketOut('count')}
                className={cx(
                  'rounded-2xl border p-3.5 text-left transition relative cursor-pointer',
                  marketOut === 'count'
                    ? 'border-amber-400 bg-amber-400/20 shadow-lg ring-2 ring-amber-400'
                    : 'border-emerald-800/60 bg-emerald-950/40 hover:bg-emerald-900/40',
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white flex items-center gap-1.5">
                    <span>🛒</span> Count Mode
                  </span>
                  {marketOut === 'count' && (
                    <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[0.62rem] font-black text-stone-950 uppercase">
                      Selected
                    </span>
                  )}
                </div>
                <p className="text-xs text-emerald-200/90 mt-1 leading-snug">
                  When the market runs out, the game ends there! Lowest count in hand wins (Stars double, Whot 20).
                </p>
              </button>
            </div>

            {/* Stacking Rule */}
            <div className="pt-2">
              <p className="mb-1 text-[0.65rem] font-extrabold tracking-wider text-amber-300 uppercase">
                Pick 2 & Pick 3 Defense
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setStacking(false)}
                  className={cx(
                    'rounded-xl border p-2 text-left transition',
                    !stacking
                      ? 'border-amber-400/90 bg-amber-400/20 ring-1 ring-amber-400'
                      : 'border-emerald-800/60 bg-emerald-950/40',
                  )}
                >
                  <span className="block text-xs font-bold text-white">✋ No Stacking</span>
                  <span className="block text-[0.62rem] text-emerald-300/80">Next player picks at once</span>
                </button>
                <button
                  type="button"
                  onClick={() => setStacking(true)}
                  className={cx(
                    'rounded-xl border p-2 text-left transition',
                    stacking
                      ? 'border-amber-400/90 bg-amber-400/20 ring-1 ring-amber-400'
                      : 'border-emerald-800/60 bg-emerald-950/40',
                  )}
                >
                  <span className="block text-xs font-bold text-white">🔥 Stacking</span>
                  <span className="block text-[0.62rem] text-emerald-300/80">Defend 2 with a 2</span>
                </button>
              </div>
            </div>
          </div>

          {/* Deal & Play Button */}
          <button
            type="button"
            disabled={busy}
            onClick={() => void start(marketOut)}
            className="mt-6 w-full rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 py-3.5 text-sm font-extrabold tracking-wide text-stone-950 shadow-xl transition-all duration-200 hover:brightness-110 active:scale-95 disabled:opacity-50"
          >
            {busy ? 'Dealing cards…' : `Play ${marketOut === 'count' ? 'Count Rules' : 'Rollover Rules'} 🃏`}
          </button>
        </div>

        <WhotRulesModal
          open={showRules}
          onClose={() => setShowRules(false)}
          marketOut={marketOut}
          stacking={stacking}
        />
      </div>
    )
  }

  /* =========================================================================
     2. GAME ACTIVE — RECREATING THE EXACT LAGOSLIFE.APP UI
     ========================================================================= */

  const over = view.winner !== null
  const hand = view.my_hand ?? []
  const top = view.top
  const topShape = view.called ?? top?.s

  /** Legality check for playing a card */
  const isCardPlayable = (c: WhotCard): boolean => {
    if (!view.my_turn || over) return false
    if (view.pending > 0) {
      if (!view.stacking) return false // No stacking: must go to market
      return (top?.n === 2 && c.n === 2) || (top?.n === 5 && c.n === 5)
    }
    return c.s === 'whot' || c.n === 20 || c.s === topShape || c.n === top?.n
  }

  /** Friendly feedback if player taps an unplayable card */
  const handleCardClick = (card: WhotCard, index: number) => {
    if (over) return

    if (!view.my_turn) {
      notify(`⏳ It's not your turn! Waiting on @${partnerName}`)
      return
    }

    if (view.pending > 0) {
      if (!view.stacking) {
        notify(`⚡ No stacking here! Go to market and pick ${view.pending}`)
        return
      }
      if (!((top?.n === 2 && card.n === 2) || (top?.n === 5 && card.n === 5))) {
        notify(`⚡ Must defend with a ${top?.n} or go to market to pick ${view.pending}!`)
        return
      }
    }

    if (!isCardPlayable(card)) {
      const matchNeeded = topShape ? topShape.toUpperCase() : 'matching shape'
      notify(`❌ Cannot play! Needs a ${matchNeeded} or ${top?.n}, or Whot 20.`)
      return
    }

    // Play card
    if (card.s === 'whot' || card.n === 20) {
      setCalling(card)
    } else {
      void play(index)
    }
  }

  return (
    <div className="mx-auto flex flex-col max-w-md w-full px-2 py-1 text-white select-none">
      {/* Flight animation overlay for cards moving across screen */}
      <FlyingCardOverlay flights={flights} />

      {/* -------------------------------------------------------------------
          TOP HEADER BAR (matching screenshot top)
          ------------------------------------------------------------------- */}
      <div className="flex items-center justify-between pb-2">
        <div>
          <div className="flex items-center gap-1.5">
            <span className="text-base">🎴</span>
            <span className="text-sm font-black tracking-tight text-white">Whot! • 2 players</span>
          </div>
          <p className="text-[0.65rem] text-emerald-300/80 font-medium tracking-tight">
            Table for Two • Naija Whot
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Active game rule pill (read-only view of agreed rules for this game) */}
          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="rounded-full bg-stone-800/80 px-2.5 py-1 text-[0.65rem] font-bold text-amber-300 hover:bg-stone-700 transition border border-white/10 flex items-center gap-1"
            title="View active table rules"
          >
            <span>{view.market_out === 'count' ? '🛒 Count' : '🔁 Rollover'}</span>
          </button>

          {/* Table Chat button */}
          <button
            type="button"
            onClick={() => setShowChat(true)}
            className="grid size-8 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition text-xs"
            title="Table chat"
            aria-label="Table chat"
          >
            💬
          </button>

          {/* Sound toggle */}
          <button
            type="button"
            onClick={toggleSound}
            className="grid size-8 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition text-xs"
            title={soundOn ? 'Mute sound' : 'Enable sound'}
            aria-label="Toggle sound"
          >
            {soundOn ? '🔊' : '🔇'}
          </button>

          {/* Resign button (only when game is actively in progress) */}
          {!over && (
            <button
              type="button"
              onClick={() => void resign()}
              disabled={busy}
              className="rounded-full bg-rose-950/80 hover:bg-rose-900 border border-rose-500/40 px-2.5 py-1 text-[0.65rem] font-bold text-rose-200 hover:text-white transition active:scale-95 flex items-center gap-1 shadow-sm"
              title="Resign this game"
            >
              <span>🏳️</span>
              <span>Resign</span>
            </button>
          )}

          {/* Exit / Close button to leave the game back to menu */}
          <button
            type="button"
            onClick={onBack}
            className="grid size-8 place-items-center rounded-full bg-white/10 text-white/80 hover:bg-white/20 transition text-xs font-bold"
            title="Back to Games"
            aria-label="Back to Games"
          >
            ✕
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------
          PLAYER PROFILE PILLS (matching screenshot with turn timer)
          ------------------------------------------------------------------- */}
      <div className="grid grid-cols-2 gap-2 pb-2">
        {/* You */}
        <div
          className={cx(
            'flex items-center gap-2.5 rounded-full px-3 py-1.5 border transition-all duration-300 relative',
            view.my_turn && !over
              ? 'border-amber-400 bg-amber-500/20 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
              : 'border-white/15 bg-black/40',
          )}
        >
          <div className="relative grid size-7 shrink-0 place-items-center rounded-full bg-amber-400 text-[0.65rem] font-black text-black">
            {myName.slice(0, 1).toUpperCase()}
            {view.my_turn && !over && (
              <span className="absolute -inset-1 rounded-full border-2 border-amber-300 animate-pulse pointer-events-none" />
            )}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-bold text-white">You</p>
            <div className="flex items-center gap-1.5 text-[0.65rem] text-white/90 font-semibold">
              <span>🃏 {view.my_count}</span>
              {view.my_turn && !over && (
                <span className="font-extrabold text-amber-300">{turnSeconds}s</span>
              )}
            </div>
          </div>
        </div>

        {/* Partner */}
        <div
          className={cx(
            'flex items-center gap-2.5 rounded-full px-3 py-1.5 border transition-all duration-300 relative',
            !view.my_turn && !over
              ? 'border-amber-400 bg-amber-500/20 shadow-[0_0_12px_rgba(251,191,36,0.35)]'
              : 'border-white/15 bg-black/40',
          )}
        >
          <div className="relative grid size-7 shrink-0 place-items-center rounded-full bg-rose-500 text-[0.65rem] font-black text-white">
            {partnerName.slice(0, 1).toUpperCase()}
            {!view.my_turn && !over && (
              <span className="absolute -inset-1 rounded-full border-2 border-amber-300 animate-pulse pointer-events-none" />
            )}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-xs font-bold text-white">@{partnerName}</p>
            <div className="flex items-center gap-1.5 text-[0.65rem] text-white/90 font-semibold">
              <span>🃏 {view.their_count}</span>
              {!view.my_turn && !over && (
                <span className="font-extrabold text-amber-300">{turnSeconds}s</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------
          NOTIFICATION / STATUS TOAST (matching @marvellousonyeme21: Check up! 🎉)
          ------------------------------------------------------------------- */}
      <div className="pb-2">
        <div
          className={cx(
            'flex items-center justify-between rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200 border',
            errorToast
              ? 'border-red-500/50 bg-red-950/80 text-red-200'
              : over
                ? 'border-amber-400/60 bg-amber-950/70 text-amber-300 animate-pulse'
                : 'border-white/10 bg-black/40 text-emerald-200',
          )}
        >
          <span className="truncate">
            {errorToast || announcement}
          </span>
          <button
            type="button"
            onClick={() => setShowChat(true)}
            className="text-sm ml-2 hover:scale-110 transition active:scale-95 shrink-0"
            title="Chat reaction"
          >
            😄
          </button>
        </div>
      </div>

      {/* -------------------------------------------------------------------
          THE GREEN FELT TABLE ARENA (Exact design from user screenshot)
          ------------------------------------------------------------------- */}
      <div
        /* No overflow-hidden. It was cropping the hand against the table's
           rounded corners — the end cards lost their outer half and the lifted
           ones lost their tops. The baize keeps its curve regardless, because
           border-radius clips a background by itself; overflow-hidden only
           ever clipped the children, which here are the cards. */
        className="relative flex min-h-[440px] flex-col justify-between rounded-[2.5rem] border-[6px] border-[#8A572A] p-4 text-center shadow-[0_20px_45px_rgba(0,0,0,0.85),inset_0_0_36px_rgba(0,0,0,0.65)]"
        style={{
          background:
            'radial-gradient(ellipse at 50% 35%, #185A37 0%, #0D3822 65%, #072516 100%)',
        }}
      >
        {/* -----------------------------------------------------------------
            EXPLOSIVE 3D CENTER ANNOUNCEMENT (Matching Screenshot 2: PICK TWO!)
            ----------------------------------------------------------------- */}
        {bigAnnouncement && (
          <div className="absolute inset-0 z-40 pointer-events-none flex flex-col items-center justify-center p-4 animate-in zoom-in-75 duration-200">
            <div className="flex flex-col items-center justify-center text-center">
              <h2
                className="text-4xl sm:text-5xl font-black italic tracking-wider text-amber-400 drop-shadow-[0_4px_16px_rgba(0,0,0,0.95)]"
                style={{
                  WebkitTextStroke: '1.5px #78350F',
                  textShadow: '0 4px 0 #92400E, 0 6px 14px rgba(0,0,0,0.9)',
                }}
              >
                {bigAnnouncement.title}
              </h2>
              {bigAnnouncement.subtitle && (
                <p className="mt-1.5 text-xs sm:text-sm font-extrabold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.95)] bg-black/50 px-3 py-1 rounded-full border border-white/10">
                  {bigAnnouncement.subtitle}
                </p>
              )}
            </div>
          </div>
        )}

        {/* OPPONENT HAND AT TOP OF TABLE */}
        <div ref={opponentFanRef} className="relative flex flex-col items-center pt-1 pb-3">
          {/* Mini-fan of red Whot cards */}
          <div className="relative flex justify-center -space-x-3 mb-1">
            {Array.from({ length: Math.min(view.their_count, 6) }, (_, i) => {
              const rotation = (i - Math.min(view.their_count, 6) / 2) * 5
              return (
                <div
                  key={i}
                  style={{
                    transform: `rotate(${rotation}deg) scale(0.68)`,
                    transformOrigin: 'bottom center',
                  }}
                  className="transition-transform"
                >
                  <WhotBack small />
                </div>
              )
            })}
          </div>

          {/* Opponent pill badge: @Waslot001 5 */}
          <div className="flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-0.5 text-xs font-bold text-white shadow border border-white/10">
            <span>@{partnerName}</span>
            <span className="rounded-full bg-white/20 px-1.5 text-[0.65rem] text-amber-300">
              {view.their_count}
            </span>
          </div>
        </div>

        {/* -----------------------------------------------------------------
            TABLE CENTER: MARKET & DISCARD PILE (Matching screenshot)
            ----------------------------------------------------------------- */}
        <div className="relative my-auto flex items-center justify-center gap-7 py-3">
          {/* Left: Market Pile */}
          <div ref={marketPileRef} className="flex flex-col items-center">
            <div className="relative">
              <WhotBack
                stacked
                onClick={view.my_turn && !over && !busy ? () => void market() : undefined}
                disabled={!view.my_turn || over || busy}
              />
              {view.pending > 0 && view.my_turn && (
                <div className="absolute -top-3 -right-3 rounded-full bg-red-600 px-2 py-0.5 text-[0.65rem] font-black text-white shadow-lg animate-bounce">
                  +{view.pending}
                </div>
              )}
            </div>
            <span className="mt-2 text-xs font-bold text-white/80 tracking-wide drop-shadow">
              Market • {view.market}
            </span>
          </div>

          {/* Right: Discard / Played Pile */}
          <div ref={discardPileRef} className="flex flex-col items-center">
            <div className="relative">
              {/* Layered cards underneath for authentic physical pile feel */}
              <div
                className="absolute inset-0 pointer-events-none opacity-80"
                style={{ transform: 'rotate(-10deg) translate(-2px, 3px)' }}
              >
                <WhotBack />
              </div>
              <div
                className="absolute inset-0 pointer-events-none opacity-90"
                style={{ transform: 'rotate(6deg) translate(3px, -2px)' }}
              >
                <WhotFace card={{ s: 'circle', n: 1 }} flat />
              </div>

              {/* Active top card */}
              <div className="relative z-10">
                {top ? (
                  <WhotFace card={top} flat />
                ) : (
                  <WhotBack />
                )}
              </div>

              {/* Floating "I need [SHAPE]" speech bubble (Matching Screenshot 1) */}
              {view.called && (
                <div className="absolute -top-7 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-amber-400 px-2.5 py-0.5 text-xs font-black text-stone-950 shadow-xl after:content-[''] after:absolute after:top-full after:left-1/2 after:-translate-x-1/2 after:border-4 after:border-transparent after:border-t-amber-400">
                  <span>I need</span>
                  <span className="text-base leading-none">
                    {view.called === 'circle' && '●'}
                    {view.called === 'triangle' && '▲'}
                    {view.called === 'cross' && '✚'}
                    {view.called === 'square' && '■'}
                    {view.called === 'star' && '★'}
                  </span>
                </div>
              )}

              {/* Floating banner if pending cards owed */}
              {view.pending > 0 && !view.called && (
                <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 whitespace-nowrap rounded-full bg-red-600 px-2.5 py-0.5 text-[0.65rem] font-black text-white shadow-xl animate-pulse">
                  <span>🔥 {view.pending} Owed</span>
                </div>
              )}
            </div>

            <span className="mt-2 text-xs font-bold text-white/80 tracking-wide drop-shadow">
              Played Pile
            </span>
          </div>
        </div>

        {/* -----------------------------------------------------------------
            BANNER: MARKET LOW WARNING (Only shows when market <= 3 cards left)
            ----------------------------------------------------------------- */}
        {view.market <= 3 && view.market > 0 && (
          <div className="my-1 rounded-xl bg-black/50 py-1 px-3 text-center border border-amber-400/30 animate-in fade-in duration-200">
            <p className="text-[0.68rem] text-amber-300 font-semibold tracking-tight">
              {view.market} card{view.market === 1 ? '' : 's'} left in the market.{' '}
              {view.market_out === 'count'
                ? 'When it runs out, the lowest count in hand wins'
                : 'When it runs out, played cards will rollover and reshuffle'}
            </p>
          </div>
        )}

        {/* -----------------------------------------------------------------
            MODAL: CALL A SHAPE (When playing 20 WHOT)
            ----------------------------------------------------------------- */}
        {calling !== null && (
          <div className="absolute inset-0 z-30 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
            <div className="w-full max-w-xs rounded-3xl border border-amber-400/50 bg-[#0E341F] p-4 text-center shadow-2xl">
              <p className="text-sm font-black tracking-wide text-amber-300 uppercase">
                Call a Shape ✨
              </p>
              <p className="text-[0.68rem] text-emerald-200/80 mt-0.5">
                Which shape do you want to ask for?
              </p>

              <div className="mt-4 grid grid-cols-5 gap-2">
                {SHAPE_NAMES.map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      // Find it again at the moment of playing, because the
                      // hand may have moved under us since it was chosen.
                      const at = hand.findIndex(
                        (h) => h.s === calling.s && h.n === calling.n,
                      )
                      if (at < 0) {
                        setCalling(null)
                        notify('That card has gone — pick another', true)
                        return
                      }
                      void play(at, k)
                    }}
                    className="flex flex-col items-center justify-center rounded-xl border border-stone-800/30 bg-[#FFFDF8] py-2.5 shadow-md transition-all duration-150 hover:-translate-y-1 hover:brightness-105 active:scale-95 cursor-pointer"
                    aria-label={`Call ${k}`}
                  >
                    <Shape kind={k} size={28} />
                    <span className="mt-1 text-[0.55rem] font-bold text-[#781822] capitalize">
                      {k}
                    </span>
                  </button>
                ))}
              </div>

              <button
                type="button"
                onClick={() => setCalling(null)}
                className="mt-4 text-xs font-semibold text-rose-300 hover:text-white transition"
              >
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* -----------------------------------------------------------------
            BOTTOM: PLAYER HAND (Fanned layout with lifted playable cards)
            ----------------------------------------------------------------- */}
        <div className="relative pt-2 pb-1">
          {/* Hand Cards */}
          {/* Wraps rather than scrolls. A hand you have to swipe is a hand you
              cannot read, and the two cards at the ends were sitting half
              outside the table — which is the one place they must never be,
              because choosing requires seeing all of them at once. Cards shrink
              once there are more than five, so a big hand still fits the width
              of a phone. */}
          <div className="flex flex-wrap items-end justify-center gap-y-2 -space-x-1.5 px-3 pt-8 pb-3">
            {hand.map((c, i) => {
              const playable = isCardPlayable(c)
              const count = hand.length
              const mid = (count - 1) / 2
              // A gentler arc. At 4° a card and its neighbour differed enough
              // that the ones at the ends were leaning out of the row and
              // clipping on the table edge; 2° still reads as a held hand.
              const angle = count > 1 ? (i - mid) * 2 : 0
              const yOffset = playable ? -20 : (count > 1 ? Math.abs(i - mid) * 1.5 : 0)

              return (
                <div
                  key={`${c.s}-${c.n}-${i}`}
                  ref={(el) => {
                    handCardRefs.current[i] = el
                  }}
                  style={{
                    transform: `rotate(${angle}deg) translateY(${yOffset}px)`,
                    transformOrigin: 'bottom center',
                    zIndex: playable ? 20 + i : i,
                  }}
                  className="transition-all duration-200"
                >
                  <WhotFace
                    card={c}
                    small={hand.length > 5}
                    isPlayable={playable}
                    disabled={over || busy}
                    onClick={() => handleCardClick(c, i)}
                  />
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* -------------------------------------------------------------------
          HELP TEXT & ACTIONS DIRECTLY UNDER TABLE (Matching Screenshot 1, 2, 3)
          ------------------------------------------------------------------- */}
      <div className="mt-2 flex items-center justify-between text-xs px-1">
        <span className="text-[0.72rem] text-emerald-200 font-medium">
          {over
            ? `Game finished · ${view.winner === view.seat ? 'You won! 🏆' : `${partnerName} won ${view.outcome ? `(${view.outcome})` : ''}`}`
            : view.my_turn
              ? 'Tap a lifted card to play it'
              : `@${partnerName} is playing…`}
        </span>

        {/* Buttons on the right (matching screenshot 1, 2, 3: [Go to market] [Rules]) */}
        <div className="flex items-center gap-2">
          {!over && (
            <button
              type="button"
              disabled={!view.my_turn || busy}
              onClick={() => void market()}
              className="rounded-full bg-stone-800/80 hover:bg-stone-700/80 px-3.5 py-1.5 text-xs font-bold text-white transition active:scale-95 disabled:opacity-40 border border-white/10"
            >
              {view.pending > 0 ? `Pick ${view.pending}` : 'Go to market'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowRules(true)}
            className="rounded-full bg-stone-800/80 hover:bg-stone-700/80 px-3.5 py-1.5 text-xs font-bold text-white transition active:scale-95 border border-white/10"
          >
            Rules
          </button>
        </div>
      </div>

      {/* End game deal again button */}
      {over && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => void clear()}
            className="w-full rounded-2xl bg-gradient-to-r from-amber-500 via-yellow-500 to-amber-600 py-3 text-sm font-extrabold text-stone-950 shadow-lg hover:brightness-110 active:scale-95 transition"
          >
            Deal Again 🃏
          </button>
        </div>
      )}

      {/* House Rules Modal */}
      <WhotRulesModal
        open={showRules}
        onClose={() => setShowRules(false)}
        marketOut={view.market_out}
        stacking={view.stacking}
      />

      {/* Table Chat Drawer */}
      <WhotChatDrawer
        open={showChat}
        onClose={() => setShowChat(false)}
        matchId={matchId}
        myName={myName}
        partnerName={partnerName}
      />
    </div>
  )
}
