/**
 * A small, deterministic pool table.
 *
 * The other three games keep their rules in Postgres, which is what stops
 * either of you cheating. Pool cannot: there is no sane way to run a physics
 * engine inside a database, so the simulation has to happen in a browser.
 *
 * So the trust comes from somewhere else — determinism. This engine uses a
 * fixed timestep, no randomness, and nothing but ordinary float arithmetic, so
 * the same table plus the same shot produces the same result on every device,
 * every time. The shooter sends only the shot (an angle and a power); both
 * clients then simulate it independently and must agree. If your partner's
 * device computes a different table from the one the server was told about, it
 * says so. Nobody is trusted; the arithmetic is.
 *
 * The table is 2 long by 1 wide in abstract units. Everything else — pixels,
 * rendering — is the component's problem.
 */

export const TABLE = { w: 2, h: 1 }
export const R = 0.028
/** Pocket mouths: four corners and the two middles. */
export const POCKETS: [number, number][] = [
  [0, 0], [1, 0], [2, 0],
  [0, 1], [1, 1], [2, 1],
]
export const POCKET_R = 0.055

/** Per step, not per second — the timestep is fixed so this is a constant. */
const FRICTION = 0.994
const DT_STEPS = 2400
/** Below this a ball has stopped. Without it they creep forever. */
const STILL = 0.0004
/** Head-on collisions lose a little; a perfectly elastic table feels wrong. */
const RESTITUTION = 0.96

export type Ball = {
  /** 0 is the cue, 1–7 solids, 8 the black, 9–15 stripes. */
  id: number
  x: number
  y: number
  vx: number
  vy: number
  /** Potted. Stays in the array so indexes never shift. */
  in: boolean
}

export type ShotEvents = {
  /** The first object ball the cue touched, or null if it hit nothing. */
  firstHit: number | null
  potted: number[]
  cueSunk: boolean
  /** Did anything reach a cushion after contact? A shot where nothing does is a foul. */
  cushionAfterContact: boolean
}

/** The opening rack: cue on the baulk line, fifteen in a triangle. */
export function rack(): Ball[] {
  const balls: Ball[] = [{ id: 0, x: 0.5, y: 0.5, vx: 0, vy: 0, in: false }]

  // Standard-ish order: 8 in the middle, a solid and a stripe in the corners.
  const order = [1, 11, 5, 8, 10, 2, 13, 3, 14, 6, 15, 9, 4, 7, 12]
  const apex = 1.35
  let n = 0

  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      balls.push({
        id: order[n++],
        x: apex + row * R * 1.74,
        y: 0.5 + (i - row / 2) * R * 2.02,
        vx: 0,
        vy: 0,
        in: false,
      })
    }
  }
  return balls
}

function dist(ax: number, ay: number, bx: number, by: number) {
  return Math.hypot(ax - bx, ay - by)
}

/**
 * Run a shot to completion.
 *
 * Returns the settled table and what happened, so the caller can both animate
 * it and report it. Frames are captured for the animation — the same approach
 * as Ayo's sowing, and for the same reason: the end position alone tells you
 * nothing about the shot.
 */
export function simulate(
  start: Ball[],
  angle: number,
  power: number,
): { balls: Ball[]; events: ShotEvents; frames: Ball[][] } {
  const balls: Ball[] = start.map((b) => ({ ...b }))
  const cue = balls[0]

  // Power is 0–1 from the UI; this maps it to something that crosses the table.
  const speed = 0.0009 + power * 0.0075
  cue.vx = Math.cos(angle) * speed
  cue.vy = Math.sin(angle) * speed

  const events: ShotEvents = {
    firstHit: null,
    potted: [],
    cueSunk: false,
    cushionAfterContact: false,
  }

  const frames: Ball[][] = []
  let step = 0

  while (step < DT_STEPS) {
    step++

    let moving = false
    for (const b of balls) {
      if (b.in) continue
      b.x += b.vx
      b.y += b.vy
      b.vx *= FRICTION
      b.vy *= FRICTION
      if (Math.hypot(b.vx, b.vy) < STILL) {
        b.vx = 0
        b.vy = 0
      } else {
        moving = true
      }
    }

    // Cushions. Reflect, and remember it if contact has already happened.
    for (const b of balls) {
      if (b.in) continue
      let hit = false
      if (b.x < R) { b.x = R; b.vx = -b.vx * RESTITUTION; hit = true }
      if (b.x > TABLE.w - R) { b.x = TABLE.w - R; b.vx = -b.vx * RESTITUTION; hit = true }
      if (b.y < R) { b.y = R; b.vy = -b.vy * RESTITUTION; hit = true }
      if (b.y > TABLE.h - R) { b.y = TABLE.h - R; b.vy = -b.vy * RESTITUTION; hit = true }
      if (hit && events.firstHit !== null) events.cushionAfterContact = true
    }

    // Ball on ball. Equal masses, so the collision is a swap of the velocity
    // components along the line between the centres.
    for (let i = 0; i < balls.length; i++) {
      const a = balls[i]
      if (a.in) continue
      for (let j = i + 1; j < balls.length; j++) {
        const b = balls[j]
        if (b.in) continue

        const d = dist(a.x, a.y, b.x, b.y)
        if (d >= R * 2 || d === 0) continue

        const nx = (b.x - a.x) / d
        const ny = (b.y - a.y) / d

        // Push them apart first, or they stick together and jitter.
        const overlap = R * 2 - d
        a.x -= nx * overlap * 0.5
        a.y -= ny * overlap * 0.5
        b.x += nx * overlap * 0.5
        b.y += ny * overlap * 0.5

        const p = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
        if (p <= 0) continue

        a.vx -= p * nx * RESTITUTION
        a.vy -= p * ny * RESTITUTION
        b.vx += p * nx * RESTITUTION
        b.vy += p * ny * RESTITUTION

        // The first thing the cue touched decides whether the shot was legal.
        if (events.firstHit === null && (a.id === 0 || b.id === 0)) {
          events.firstHit = a.id === 0 ? b.id : a.id
        }
      }
    }

    // Pockets.
    for (const b of balls) {
      if (b.in) continue
      for (const [px, py] of POCKETS) {
        if (dist(b.x, b.y, px, py) < POCKET_R) {
          b.in = true
          b.vx = 0
          b.vy = 0
          if (b.id === 0) events.cueSunk = true
          else events.potted.push(b.id)
          break
        }
      }
    }

    // Every fourth step is plenty for 60fps playback and keeps the payload
    // sane — the shot is reconstructed from the same simulation anyway.
    if (step % 4 === 0) {
      frames.push(balls.map((b) => ({ ...b })))
    }

    if (!moving) break
  }

  frames.push(balls.map((b) => ({ ...b })))
  return { balls, events, frames }
}

/** Which group a ball belongs to. The black belongs to neither. */
export function groupOf(id: number): 'solids' | 'stripes' | null {
  if (id >= 1 && id <= 7) return 'solids'
  if (id >= 9 && id <= 15) return 'stripes'
  return null
}

/**
 * A fingerprint of the settled table, rounded hard.
 *
 * Both clients simulate the same shot and compare this. Rounding to four
 * decimals absorbs nothing meaningful — two tables that agree to a tenth of a
 * millimetre are the same table — while catching a client that invented a
 * result rather than computing one.
 */
export function fingerprint(balls: Ball[]): string {
  return balls
    .map((b) => `${b.id}:${b.in ? 'x' : `${b.x.toFixed(4)},${b.y.toFixed(4)}`}`)
    .join('|')
}
