import { useRef, useState, type ReactNode } from 'react'
import { cx } from './ui'

/**
 * Drag-to-reorder that works with a thumb.
 *
 * HTML5 drag-and-drop is desktop-only in practice — it never fires on touch —
 * so this uses pointer events, which behave identically for mouse and finger.
 * The dragged tile follows the pointer, and the target index comes from
 * measuring which tile's centre the pointer is nearest.
 *
 * Only active in reorder mode, so an ordinary tap still opens a photo.
 */
export default function ReorderableGrid<T>({
  items,
  getKey,
  renderItem,
  onReorder,
  active,
  className,
}: {
  items: T[]
  getKey: (item: T) => string
  renderItem: (item: T, index: number) => ReactNode
  onReorder: (next: T[]) => void
  active: boolean
  className?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const start = useRef({ x: 0, y: 0 })

  function nearestIndex(clientX: number, clientY: number): number | null {
    const container = containerRef.current
    if (!container) return null

    const tiles = Array.from(container.children) as HTMLElement[]
    let best: number | null = null
    let bestDistance = Infinity

    tiles.forEach((tile, i) => {
      const rect = tile.getBoundingClientRect()
      const cx2 = rect.left + rect.width / 2
      const cy = rect.top + rect.height / 2
      const distance = Math.hypot(clientX - cx2, clientY - cy)
      if (distance < bestDistance) {
        bestDistance = distance
        best = i
      }
    })

    return best
  }

  function onPointerDown(e: React.PointerEvent, index: number) {
    if (!active) return
    e.preventDefault()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    start.current = { x: e.clientX, y: e.clientY }
    setDragIndex(index)
    setOverIndex(index)
    setOffset({ x: 0, y: 0 })
  }

  function onPointerMove(e: React.PointerEvent) {
    if (dragIndex === null) return
    setOffset({ x: e.clientX - start.current.x, y: e.clientY - start.current.y })
    const target = nearestIndex(e.clientX, e.clientY)
    if (target !== null) setOverIndex(target)
  }

  function onPointerUp() {
    if (dragIndex === null) return

    if (overIndex !== null && overIndex !== dragIndex) {
      const next = [...items]
      const [moved] = next.splice(dragIndex, 1)
      next.splice(overIndex, 0, moved)
      onReorder(next)
    }

    setDragIndex(null)
    setOverIndex(null)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div ref={containerRef} className={className}>
      {items.map((item, index) => {
        const isDragging = dragIndex === index
        const isTarget = overIndex === index && dragIndex !== null && !isDragging

        return (
          <div
            key={getKey(item)}
            onPointerDown={(e) => onPointerDown(e, index)}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={
              isDragging
                ? {
                    transform: `translate(${offset.x}px, ${offset.y}px) scale(1.06)`,
                    zIndex: 50,
                  }
                : undefined
            }
            className={cx(
              'relative',
              active && 'touch-none',
              isDragging && 'opacity-90 shadow-2xl',
              !isDragging && dragIndex !== null && 'transition-transform',
              isTarget && 'ring-2 ring-pink-400 ring-offset-2 ring-offset-rose-950 rounded-2xl',
              active && !isDragging && 'animate-pulse-soft',
            )}
          >
            {renderItem(item, index)}

            {active && (
              <span className="pointer-events-none absolute top-1.5 left-1.5 rounded-md bg-rose-950/80 px-1.5 py-0.5 text-[10px] font-bold text-rose-200">
                {index + 1}
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}
