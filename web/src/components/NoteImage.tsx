import { useCallback, useEffect, useRef, useState } from 'react'
import { signedUrl } from '../lib/media'
import { useSession } from '../context/SessionProvider'
import { cx, Modal } from './ui'


/**
 * A note, as a picture you can post.
 *
 * Drawn straight onto a canvas rather than screenshotted off the DOM. A
 * library that rasterises HTML would have meant shipping a dependency to get a
 * blurry approximation of the screen at whatever size the phone happened to
 * be; this draws at full export resolution, so the text is sharp at 1080 wide
 * and the layout is designed for a square rather than inherited from a page.
 *
 * Takes a shape rather than a note, because a sealed letter finally opened is
 * at least as worth posting as a note is, and the only difference between them
 * is which field the words are in.
 *
 * Sharing, not downloading, is the real path. A PWA on iOS cannot reliably
 * save a file from a link, but it can hand a PNG to the share sheet — which is
 * where you were going anyway. The download is the fallback for desktop.
 */

type Template = {
  key: string
  name: string
  bg: [string, string]
  ink: string
  soft: string
  accent: string
  /** Drawn behind the text — the room this app is set in. */
  glow: string
}

const TEMPLATES: Template[] = [
  {
    key: 'candle',
    name: 'Candle',
    bg: ['#2A1018', '#14070C'],
    ink: '#FFF3F5',
    soft: '#E8A9B8',
    accent: '#F0B429',
    glow: 'rgba(240, 180, 41, 0.16)',
  },
  {
    key: 'rose',
    name: 'Rose',
    bg: ['#4A1428', '#1E0812'],
    ink: '#FFF0F4',
    soft: '#F2B3C6',
    accent: '#EC4899',
    glow: 'rgba(236, 72, 153, 0.20)',
  },
  {
    key: 'ink',
    name: 'Ink',
    bg: ['#141024', '#08060F'],
    ink: '#F2F0FF',
    soft: '#A9A4D0',
    accent: '#7C7BC4',
    glow: 'rgba(124, 123, 196, 0.18)',
  },
  {
    key: 'paper',
    name: 'Paper',
    bg: ['#F7EFE6', '#EFE2D4'],
    ink: '#2A1018',
    soft: '#8A6B58',
    accent: '#B2504F',
    glow: 'rgba(178, 80, 79, 0.08)',
  },
]

const SIZES = [
  { key: 'post', name: 'Post', w: 1080, h: 1350 },
  { key: 'square', name: 'Square', w: 1080, h: 1080 },
  { key: 'story', name: 'Story', w: 1080, h: 1920 },
] as const

/** Storage is cross-origin, so the avatar has to be fetched CORS-clean or it
 *  taints the canvas and toBlob throws a SecurityError. */
function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Greedy wrap. Returns the lines, so the caller can size the block first. */
function wrap(ctx: CanvasRenderingContext2D, text: string, max: number): string[] {
  const lines: string[] = []
  // Respect the line breaks they typed — a note with stanzas is a note with
  // stanzas, and reflowing it into a paragraph loses the shape of it.
  for (const para of text.split('\n')) {
    if (!para.trim()) {
      lines.push('')
      continue
    }
    let line = ''
    for (const word of para.split(/\s+/)) {
      const next = line ? `${line} ${word}` : word
      if (ctx.measureText(next).width > max && line) {
        lines.push(line)
        line = word
      } else {
        line = next
      }
    }
    if (line) lines.push(line)
  }
  return lines
}

/**
 * A tiny deterministic generator, seeded off the note's id.
 *
 * Math.random would re-scatter the sparkles on every redraw — every template
 * tap, every size change — so the picture would never settle and the one you
 * exported would not be the one you were looking at. Seeded, a given note has
 * its own arrangement and keeps it.
 */
function seeded(seed: string): () => number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return () => {
    h += 0x6d2b79f5
    let t = h
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A four-point star, crisp.
 *
 * The first version was mostly halo — a radial gradient two and a half times
 * the size of the star itself — so on a light background they came out as
 * grey smudges with something vaguely pointy inside. The app's own star field
 * is hard-edged white dots at one or two pixels with no blur at all, and that
 * is the look: the shape does the work, not the glow.
 *
 * The waist controls everything. Control points near the centre give long
 * tapered points; control points far out give a fat diamond. 0.12 is a glint.
 */
function star(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  colour: string,
  alpha: number,
  glow = false,
) {
  const waist = r * 0.12

  ctx.save()
  ctx.translate(x, y)
  ctx.globalAlpha = alpha
  ctx.fillStyle = colour

  // A shadow rather than a painted gradient: it hugs the shape, so the star
  // stays sharp and only the air around it lifts.
  if (glow) {
    ctx.shadowColor = colour
    ctx.shadowBlur = r * 1.6
  }

  ctx.beginPath()
  ctx.moveTo(0, -r)
  ctx.quadraticCurveTo(waist, -waist, r, 0)
  ctx.quadraticCurveTo(waist, waist, 0, r)
  ctx.quadraticCurveTo(-waist, waist, -r, 0)
  ctx.quadraticCurveTo(-waist, -waist, 0, -r)
  ctx.closePath()
  ctx.fill()

  ctx.restore()
}

/** The dust between the stars. Same as the app's night sky: a hard dot. */
function speck(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  colour: string,
  alpha: number,
) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = colour
  ctx.beginPath()
  ctx.arc(x, y, r, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

/** Anything with words, a date and an id can become a picture. */
export type Postable = {
  id: string
  title: string | null
  body: string
  created_at: string
}

export default function NoteImage({
  note,
  authorName,
  onClose,
}: {
  note: Postable | null
  authorName: string
  onClose: () => void
}) {
  const { summary } = useSession()
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [template, setTemplate] = useState(TEMPLATES[0])
  const [size, setSize] = useState<(typeof SIZES)[number]>(SIZES[0])
  const [avatar, setAvatar] = useState<HTMLImageElement | null>(null)
  const [showAvatar, setShowAvatar] = useState(true)
  const [sparkles, setSparkles] = useState(true)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState('')

  const coupleName = summary?.couple?.name ?? 'Us'

  // Signed, then loaded CORS-clean, once per note.
  useEffect(() => {
    if (!note) return
    const path = summary?.couple?.avatar_url
    if (!path) return setAvatar(null)
    void signedUrl(path).then((url) => url && void loadImage(url).then(setAvatar))
  }, [note, summary?.couple?.avatar_url])

  const draw = useCallback(async () => {
    const canvas = canvasRef.current
    if (!canvas || !note) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { w, h } = size
    canvas.width = w
    canvas.height = h

    // Web fonts have to be resolved before the first measureText, or the wrap
    // is computed against a fallback and the lines come out wrong.
    try {
      await document.fonts.ready
    } catch {
      /* no font loading API — the fallback metrics are close enough */
    }

    const t = template
    const dark = t.key !== 'paper'

    const bg = ctx.createLinearGradient(0, 0, w * 0.4, h)
    bg.addColorStop(0, t.bg[0])
    bg.addColorStop(1, t.bg[1])
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, w, h)

    // One candle, top left, the way the whole app is lit.
    const glow = ctx.createRadialGradient(w * 0.25, h * 0.18, 0, w * 0.25, h * 0.18, w * 0.9)
    glow.addColorStop(0, t.glow)
    glow.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = glow
    ctx.fillRect(0, 0, w, h)

    const pad = Math.round(w * 0.11)
    const inner = w - pad * 2

    /* ---- sparkles ------------------------------------------------------- */
    // Behind the words, never across them: the middle band is left clear so
    // nothing lands on a letter. Weighted towards the corners, which is where
    // light pools in the photographs this is pretending to be.
    if (sparkles) {
      const rand = seeded(note.id)

      // On a dark card the stars are white, the way the app's night sky is —
      // the accent as a fill turned them muddy. On paper white is invisible,
      // so that one alone uses its accent.
      const lightInk = dark ? '#FFFFFF' : t.accent

      // The dust first, so the stars sit on top of it.
      for (let i = 0; i < Math.round((w * h) / 9000); i++) {
        const x = rand() * w
        const yRaw = rand()
        // Out of the middle band, where the words are.
        const y = yRaw < 0.5 ? yRaw * 0.62 * h : (0.8 + (yRaw - 0.5) * 0.4) * h
        speck(ctx, x, y, w * (0.0011 + rand() * 0.0018), lightInk, dark ? 0.2 + rand() * 0.45 : 0.1 + rand() * 0.2)
      }

      // Then a handful of real ones. Few and large: a dozen glints read as
      // sparkle, forty read as noise.
      for (let i = 0; i < 11; i++) {
        const x = 0.06 * w + rand() * 0.88 * w
        const yRaw = rand()
        const y = yRaw < 0.5 ? (0.04 + yRaw * 0.5) * h : (0.82 + (yRaw - 0.5) * 0.34) * h

        const r = w * (0.009 + rand() * 0.02)
        const gold = rand() < 0.45
        star(
          ctx,
          x,
          y,
          r,
          gold ? t.accent : lightInk,
          dark ? 0.55 + rand() * 0.4 : 0.3 + rand() * 0.3,
          dark,
        )
      }
    }

    // A hairline frame, inset. Gives the export an edge on a white feed.
    ctx.strokeStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(42,16,24,0.14)'
    ctx.lineWidth = 2
    roundRect(ctx, pad * 0.55, pad * 0.55, w - pad * 1.1, h - pad * 1.1, 40)
    ctx.stroke()

    /* ---- the note ------------------------------------------------------- */

    // Sized to the length of it: a three-word note deserves to be enormous, a
    // long one has to fit. Measured rather than guessed, then stepped down
    // until the block fits the space left for it.
    const roomForBody = h - pad * 2 - Math.round(h * 0.22)
    let font = Math.round(w * 0.075)
    let lines: string[] = []
    let lead = 0

    for (;;) {
      ctx.font = `italic 300 ${font}px "Cormorant Garamond", Georgia, serif`
      lines = wrap(ctx, note.body.trim(), inner)
      lead = Math.round(font * 1.42)
      if (lines.length * lead <= roomForBody || font <= Math.round(w * 0.028)) break
      font -= 2
    }

    const titleGap = note.title ? Math.round(font * 1.6) : 0
    const blockH = lines.length * lead + titleGap
    let y = Math.max(pad + Math.round(h * 0.11), (h - blockH) / 2 - Math.round(h * 0.03))

    if (note.title) {
      ctx.font = `600 ${Math.round(w * 0.036)}px "Inter", system-ui, sans-serif`
      ctx.fillStyle = t.accent
      ctx.textAlign = 'center'
      ctx.fillText(note.title.toUpperCase(), w / 2, y)
      y += titleGap
    }

    ctx.font = `italic 300 ${font}px "Cormorant Garamond", Georgia, serif`
    ctx.fillStyle = t.ink
    ctx.textAlign = 'center'
    for (const line of lines) {
      ctx.fillText(line, w / 2, y)
      y += lead
    }

    /* ---- the footer ------------------------------------------------------ */

    const footY = h - pad - Math.round(h * 0.02)
    const av = Math.round(w * 0.105)

    if (avatar && showAvatar) {
      const ax = w / 2 - av / 2
      const ay = footY - av - Math.round(h * 0.055)

      ctx.save()
      ctx.beginPath()
      ctx.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2)
      ctx.closePath()
      ctx.clip()
      // Cover, not stretch — a portrait avatar squashed into a circle is the
      // one thing that would make this look cheap.
      const scale = Math.max(av / avatar.width, av / avatar.height)
      const dw = avatar.width * scale
      const dh = avatar.height * scale
      ctx.drawImage(avatar, ax + (av - dw) / 2, ay + (av - dh) / 2, dw, dh)
      ctx.restore()

      ctx.strokeStyle = t.accent
      ctx.lineWidth = 3
      ctx.beginPath()
      ctx.arc(ax + av / 2, ay + av / 2, av / 2, 0, Math.PI * 2)
      ctx.stroke()
    }

    ctx.textAlign = 'center'
    ctx.font = `500 ${Math.round(w * 0.032)}px "Inter", system-ui, sans-serif`
    ctx.fillStyle = t.soft
    ctx.fillText(`— ${authorName}`, w / 2, footY - Math.round(h * 0.022))

    ctx.font = `600 ${Math.round(w * 0.024)}px "Inter", system-ui, sans-serif`
    ctx.fillStyle = dark ? 'rgba(255,255,255,0.34)' : 'rgba(42,16,24,0.38)'
    const stamp = new Date(note.created_at).toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    })
    ctx.fillText(`${coupleName.toUpperCase()}  ·  ${stamp}`, w / 2, footY + Math.round(h * 0.014))
  }, [note, size, template, avatar, showAvatar, sparkles, authorName, coupleName])

  useEffect(() => {
    void draw()
  }, [draw])

  async function toBlob(): Promise<Blob | null> {
    const canvas = canvasRef.current
    if (!canvas) return null
    return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'))
  }

  async function share() {
    setBusy(true)
    setStatus('')
    try {
      const blob = await toBlob()
      if (!blob) throw new Error('Nothing to share')

      const file = new File([blob], 'note.png', { type: 'image/png' })

      // The share sheet is the point on a phone; a download link is close to
      // useless inside an installed PWA on iOS.
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] })
        setStatus('')
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${coupleName.toLowerCase().replace(/\s+/g, '-')}-note.png`
        a.click()
        URL.revokeObjectURL(url)
        setStatus('Saved')
      }
    } catch (err) {
      // A cancelled share sheet rejects. That is not an error worth reporting.
      if ((err as Error)?.name !== 'AbortError') {
        setStatus("Couldn't save it — try the other size")
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={note !== null} onClose={onClose} title="Make it a picture" icon="camera">
      <div className="space-y-4">
        <div className="overflow-hidden rounded-2xl border border-rose-800/50 bg-black/30">
          <canvas
            ref={canvasRef}
            className="block h-auto w-full"
            style={{ aspectRatio: `${size.w} / ${size.h}` }}
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {TEMPLATES.map((t) => (
            <button
              key={t.key}
              onClick={() => setTemplate(t)}
              className={cx(
                'flex items-center gap-2 rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                template.key === t.key
                  ? 'bg-rose-600 text-white'
                  : 'border border-rose-700/40 bg-rose-900/40 text-rose-300',
              )}
            >
              <span
                className="size-3 rounded-full"
                style={{ background: t.bg[0], boxShadow: `0 0 0 2px ${t.accent}` }}
              />
              {t.name}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap gap-2">
          {SIZES.map((s) => (
            <button
              key={s.key}
              onClick={() => setSize(s)}
              className={cx(
                'rounded-xl px-3 py-1.5 text-xs font-semibold transition',
                size.key === s.key
                  ? 'bg-rose-600 text-white'
                  : 'border border-rose-700/40 bg-rose-900/40 text-rose-300',
              )}
            >
              {s.name}
            </button>
          ))}
        </div>

        <button
          onClick={() => setSparkles((v) => !v)}
          className="flex w-full items-center gap-3 rounded-xl border border-rose-700/40 bg-rose-900/30 p-3 text-left transition hover:bg-rose-900/50"
        >
          <span
            className={cx(
              'grid size-5 shrink-0 place-items-center rounded-md border text-[0.6rem]',
              sparkles ? 'border-pink-400 bg-pink-500 text-white' : 'border-rose-600',
            )}
          >
            {sparkles && '✓'}
          </span>
          <span className="text-xs text-rose-200">Sparkles ✨</span>
        </button>

        {summary?.couple?.avatar_url && (
          <button
            onClick={() => setShowAvatar((v) => !v)}
            className="flex w-full items-center gap-3 rounded-xl border border-rose-700/40 bg-rose-900/30 p-3 text-left transition hover:bg-rose-900/50"
          >
            <span
              className={cx(
                'grid size-5 shrink-0 place-items-center rounded-md border text-[0.6rem]',
                showAvatar ? 'border-pink-400 bg-pink-500 text-white' : 'border-rose-600',
              )}
            >
              {showAvatar && '✓'}
            </span>
            <span className="text-xs text-rose-200">Put our picture on it</span>
          </button>
        )}

        {status && <p className="text-center text-xs text-rose-300">{status}</p>}

        <button
          disabled={busy}
          onClick={() => void share()}
          className="w-full rounded-2xl bg-gradient-to-r from-pink-600 to-rose-600 py-3 text-sm font-semibold text-white shadow-lg transition hover:from-pink-500 hover:to-rose-500 disabled:opacity-50"
        >
          {busy ? 'Making it…' : 'Save or share it'}
        </button>

        <p className="text-center text-[0.65rem] text-rose-500">
          Nothing leaves your phone until you pick where it goes.
        </p>
      </div>
    </Modal>
  )
}
