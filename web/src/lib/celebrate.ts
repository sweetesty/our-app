import confetti from 'canvas-confetti'

/**
 * The reveal celebration.
 *
 * Fires from the card itself rather than the top of the screen, so it reads as
 * the answer bursting open rather than a generic page effect. Colours are the
 * app's pinks and roses — default confetti colours would look like a different
 * product landed on the page.
 */

const COLOURS = ['#ec4899', '#f472b6', '#fbcfe8', '#f9a8d4', '#e11d48', '#fff1f2']

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Two angled bursts from the given element's edges, plus a soft centre puff. */
export function celebrateReveal(target?: HTMLElement | null) {
  // Someone who has asked the system for less motion should not get a screenful
  // of particles.
  if (prefersReducedMotion()) return

  const rect = target?.getBoundingClientRect()
  const originY = rect
    ? (rect.top + rect.height / 2) / window.innerHeight
    : 0.45

  const left = rect ? rect.left / window.innerWidth : 0.25
  const right = rect ? rect.right / window.innerWidth : 0.75

  const shared = {
    colors: COLOURS,
    startVelocity: 34,
    gravity: 0.9,
    scalar: 0.9,
    ticks: 180,
    disableForReducedMotion: true,
  }

  // Inward from both sides of the card.
  confetti({ ...shared, particleCount: 34, angle: 60, spread: 58, origin: { x: left, y: originY } })
  confetti({ ...shared, particleCount: 34, angle: 120, spread: 58, origin: { x: right, y: originY } })

  // A slower drift of hearts a beat later, so it settles rather than stops.
  window.setTimeout(() => {
    confetti({
      ...shared,
      particleCount: 14,
      spread: 90,
      startVelocity: 22,
      gravity: 0.5,
      scalar: 1.5,
      ticks: 260,
      origin: { x: 0.5, y: originY },
      shapes: ['circle'],
      colors: ['#f9a8d4', '#fbcfe8'],
    })
  }, 260)
}
