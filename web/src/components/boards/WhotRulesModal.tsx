type WhotRulesModalProps = {
  open: boolean
  onClose: () => void
  marketOut?: 'rollover' | 'count'
  stacking?: boolean
}

export default function WhotRulesModal({
  open,
  onClose,
  marketOut = 'rollover',
  stacking = false,
}: WhotRulesModalProps) {
  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-sm max-h-[90vh] overflow-y-auto rounded-[2rem] border border-white/10 bg-[#0F2218]/95 p-5 text-white shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        style={{
          boxShadow: '0 25px 60px rgba(0,0,0,0.9), inset 0 1px 0 rgba(255,255,255,0.12)',
        }}
      >
        {/* Header matching screenshot: 🎴 HOUSE RULES · NAIJA WHOT */}
        <div className="flex items-center justify-between pb-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <span className="text-lg">🎴</span>
            <h2 className="text-xs font-black tracking-wider text-white uppercase">
              House Rules · Naija Whot
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-7 place-items-center rounded-full bg-white/10 text-xs text-white/70 hover:bg-white/20 hover:text-white transition"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Rules List matching screenshot layout */}
        <div className="mt-4 space-y-3.5 text-xs text-[#E6EFE9] font-normal leading-snug">
          {/* 2 · 5 */}
          <div className="flex items-start gap-3">
            <span className="inline-flex shrink-0 items-center justify-center rounded-full bg-[#FFF9EE] px-2.5 py-0.5 text-[0.72rem] font-black text-[#851825] shadow-sm">
              2 · 5
            </span>
            <p className="flex-1 pt-0.5">
              {stacking ? (
                <>
                  <strong className="text-white">Pick Two, Pick Three:</strong> the next player picks them, and that's their turn. Stacking is on: a 2 defends a 2 (pick 4, pick 6…)
                </>
              ) : (
                <>
                  <strong className="text-white">Pick Two, Pick Three:</strong> the next player picks them, and that's their turn. No stacking: a 2 can't be answered with a 2 (no pick 4, no pick 9)
                </>
              )}
            </p>
          </div>

          {/* 1 */}
          <div className="flex items-start gap-3">
            <span className="inline-flex shrink-0 min-w-[32px] items-center justify-center rounded-full bg-[#FFF9EE] px-2.5 py-0.5 text-[0.72rem] font-black text-[#851825] shadow-sm">
              1
            </span>
            <p className="flex-1 pt-0.5">
              <strong className="text-white">Hold On:</strong> you play again
            </p>
          </div>

          {/* 8 */}
          <div className="flex items-start gap-3">
            <span className="inline-flex shrink-0 min-w-[32px] items-center justify-center rounded-full bg-[#FFF9EE] px-2.5 py-0.5 text-[0.72rem] font-black text-[#851825] shadow-sm">
              8
            </span>
            <p className="flex-1 pt-0.5">
              <strong className="text-white">Suspension:</strong> the next player misses their turn
            </p>
          </div>

          {/* 14 */}
          <div className="flex items-start gap-3">
            <span className="inline-flex shrink-0 min-w-[32px] items-center justify-center rounded-full bg-[#FFF9EE] px-2.5 py-0.5 text-[0.72rem] font-black text-[#851825] shadow-sm">
              14
            </span>
            <p className="flex-1 pt-0.5">
              <strong className="text-white">General Market:</strong> everyone else picks one, you play again
            </p>
          </div>

          {/* 20 */}
          <div className="flex items-start gap-3">
            <span className="inline-flex shrink-0 min-w-[32px] items-center justify-center rounded-full bg-[#FFF9EE] px-2.5 py-0.5 text-[0.72rem] font-black text-[#851825] shadow-sm">
              20
            </span>
            <p className="flex-1 pt-0.5">
              <strong className="text-white">Whot:</strong> goes on anything; call the shape you need
            </p>
          </div>

          {/* Market Out: Count vs Rollover */}
          {marketOut === 'count' ? (
            <div className="flex items-start gap-3">
              <span className="inline-flex shrink-0 min-w-[32px] items-center justify-center rounded-full bg-[#FFF9EE] px-2 py-0.5 text-[0.8rem] shadow-sm">
                🛒
              </span>
              <p className="flex-1 pt-0.5">
                <strong className="text-white">Market runs out:</strong> the game ends there. Lowest count in hand wins: each card its number, a star double, a Whot 20. Level lowest: a draw.
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3">
              <span className="inline-flex shrink-0 min-w-[32px] items-center justify-center rounded-full bg-[#FFF9EE] px-2 py-0.5 text-[0.8rem] shadow-sm">
                🔁
              </span>
              <p className="flex-1 pt-0.5">
                <strong className="text-white">Rollover:</strong> when the market runs out, the cards played (all but the top one) are shuffled into a new market and play goes on. Empty your hand to win. Only if there's nothing left to roll over: lowest count in hand wins
              </p>
            </div>
          )}

          {/* Winning */}
          <div className="flex items-start gap-3">
            <span className="inline-flex shrink-0 min-w-[32px] items-center justify-center rounded-full bg-[#FFF9EE] px-2 py-0.5 text-[0.8rem] shadow-sm">
              🎉
            </span>
            <p className="flex-1 pt-0.5">
              <strong className="text-white">Empty your hand:</strong> Check up! You win
            </p>
          </div>

          {/* Missed turns */}
          <div className="flex items-start gap-3">
            <span className="inline-flex shrink-0 min-w-[32px] items-center justify-center rounded-full bg-[#FFF9EE] px-2 py-0.5 text-[0.8rem] shadow-sm">
              ⏱️
            </span>
            <p className="flex-1 pt-0.5 text-[#B8C8BD]">
              Two missed turns, or getting up: you forfeit the round
            </p>
          </div>
        </div>

        {/* Big pill button at bottom matching screenshot */}
        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-full bg-white/15 hover:bg-white/25 py-3 text-xs font-bold text-white transition active:scale-95"
        >
          Close Rules
        </button>
      </div>
    </div>
  )
}
