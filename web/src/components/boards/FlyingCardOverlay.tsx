import { useEffect, useState } from 'react'
import { WhotFace, WhotBack } from './WhotCardArt'
import type { WhotCard } from '../../lib/types'

export type FlightMotion = {
  id: string
  card?: WhotCard
  isBack?: boolean
  startRect: { left: number; top: number; width: number; height: number }
  endRect: { left: number; top: number; width: number; height: number }
  startRotate?: number
  endRotate?: number
  durationMs?: number
  onComplete?: () => void
}

export default function FlyingCardOverlay({ flights }: { flights: FlightMotion[] }) {
  return (
    <div className="fixed inset-0 pointer-events-none z-50 overflow-hidden">
      {flights.map((f) => (
        <FlightItem key={f.id} motion={f} />
      ))}
    </div>
  )
}

function FlightItem({ motion }: { motion: FlightMotion }) {
  const [active, setActive] = useState(false)

  const duration = motion.durationMs ?? 420

  useEffect(() => {
    // Trigger transition on next paint
    const raf = requestAnimationFrame(() => {
      setActive(true)
    })
    const timer = setTimeout(() => {
      motion.onComplete?.()
    }, duration + 50)

    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(timer)
    }
  }, [duration, motion])

  const startX = motion.startRect.left
  const startY = motion.startRect.top
  const deltaX = motion.endRect.left - motion.startRect.left
  const deltaY = motion.endRect.top - motion.startRect.top

  const startRot = motion.startRotate ?? 0
  const endRot = motion.endRotate ?? (Math.random() * 16 - 8)

  return (
    <div
      style={{
        position: 'fixed',
        left: startX,
        top: startY,
        width: motion.startRect.width || 80,
        height: motion.startRect.height || 116,
        transform: active
          ? `translate3d(${deltaX}px, ${deltaY}px, 0) rotate(${endRot}deg) scale(1.04)`
          : `translate3d(0, 0, 0) rotate(${startRot}deg) scale(1)`,
        transition: `transform ${duration}ms cubic-bezier(0.2, 0.9, 0.25, 1), opacity ${duration}ms ease`,
        willChange: 'transform',
      }}
      className="drop-shadow-[0_16px_28px_rgba(0,0,0,0.8)]"
    >
      {motion.isBack || !motion.card ? (
        <WhotBack />
      ) : (
        <WhotFace card={motion.card} flat />
      )}
    </div>
  )
}
