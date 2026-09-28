/**
 * The app's own icons.
 *
 * Emoji were standing in for iconography in the chrome — the nav strip, mostly
 * — and an emoji is a picture from somebody else's font. They render a
 * different colour, weight and size on every platform, they don't take the
 * text colour with them when a tab goes active, and 🗓️ against 🖼️ against 🎁
 * at 16px is a row of coloured blobs rather than a set.
 *
 * These are one stroke weight, one grid, and `currentColor` throughout, so a
 * tab's icon turns white with its label.
 *
 * Emoji stay everywhere they are *content* rather than furniture: a nudge you
 * wrote, a deck you named, the icon on an important date. Those are the user's
 * choice and should look exactly like what they picked on their keyboard.
 */

export type IconName =
  | 'today'
  | 'moments'
  | 'chat'
  | 'cards'
  | 'notes'
  | 'timeline'
  | 'memories'
  | 'vault'
  | 'nudges'
  | 'us'
  | 'search'
  | 'settings'
  | 'more'
  | 'heart'
  | 'flame'
  | 'camera'
  | 'letter'
  | 'lock'
  | 'cake'
  | 'bolt'
  | 'sparkle'
  | 'pencil'
  | 'handbook'
  | 'bucket'
  | 'dice'

/** 24-grid paths, drawn for a 1.6 stroke. */
const PATHS: Record<IconName, React.ReactNode> = {
  // A sunrise: today, the new question.
  today: (
    <>
      <path d="M12 3v3" />
      <path d="M5.2 6.2 7.3 8.3" />
      <path d="M18.8 6.2 16.7 8.3" />
      <path d="M3 17h18" />
      <path d="M6.5 17a5.5 5.5 0 0 1 11 0" />
      <path d="M4 21h16" />
    </>
  ),
  // A stack of photos, corner turned.
  moments: (
    <>
      <rect x="6" y="3.5" width="14" height="14" rx="2.5" />
      <circle cx="10.5" cy="8" r="1.4" />
      <path d="M20 13.5 16 10l-6 5.5" />
      <path d="M16.5 20.5H6a2.5 2.5 0 0 1-2.5-2.5V7.5" />
    </>
  ),
  chat: (
    <>
      <path d="M20.5 12.2c0 3.9-3.8 7-8.5 7a9.7 9.7 0 0 1-2.9-.44L4 20.5l1.3-3.5A6.6 6.6 0 0 1 3.5 12.2c0-3.87 3.8-7 8.5-7s8.5 3.13 8.5 7Z" />
    </>
  ),
  // Two cards, one dealt across the other. The straight-on pair read as a
  // page with lines on it; the tilt is what says "deck".
  cards: (
    <>
      <rect x="9.5" y="4" width="10" height="14" rx="2.2" transform="rotate(14 14.5 11)" />
      <rect x="4" y="6" width="10" height="14" rx="2.2" />
    </>
  ),
  // A note with a corner turned down. The pushpin this replaced collapsed
  // into a small cross at 17px — the head and the needle were a couple of
  // pixels each and read as a dagger.
  notes: (
    <>
      <path d="M14 3.5H6.5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V9Z" />
      <path d="M14 3.5V9h5.5" />
      <path d="M8.5 13h7" />
      <path d="M8.5 16.5h4.5" />
    </>
  ),
  timeline: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17" />
      <path d="M8 3v4" />
      <path d="M16 3v4" />
      <path d="M8 13.5h.01" />
      <path d="M12 13.5h.01" />
      <path d="M16 13.5h.01" />
      <path d="M8 17h.01" />
      <path d="M12 17h.01" />
    </>
  ),
  // A framed picture.
  memories: (
    <>
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
      <circle cx="9" cy="10" r="1.5" />
      <path d="M20.5 15.5 16 11l-7 6.5" />
    </>
  ),
  // A wrapped box: the vault, sealed until it opens.
  vault: (
    <>
      <rect x="3.5" y="9" width="17" height="11.5" rx="2" />
      <path d="M12 9v11.5" />
      <path d="M3.5 13.5h17" />
      <path d="M12 9c-.8-2.6-2-4-3.6-4a2.2 2.2 0 0 0 0 4Z" />
      <path d="M12 9c.8-2.6 2-4 3.6-4a2.2 2.2 0 0 1 0 4Z" />
    </>
  ),
  // Two arms round each other.
  nudges: (
    <>
      <path d="M12 20.5s-6.8-4.2-8.3-8.1A4.4 4.4 0 0 1 12 8.3a4.4 4.4 0 0 1 8.3 4.1c-1.5 3.9-8.3 8.1-8.3 8.1Z" />
      <path d="M12 8.3V4" />
    </>
  ),
  // A cup, for the two of you.
  us: (
    <>
      <path d="M7.5 4h9v5.5a4.5 4.5 0 0 1-9 0Z" />
      <path d="M7.5 5.5h-2a2 2 0 0 0 0 4h2" />
      <path d="M16.5 5.5h2a2 2 0 0 1 0 4h-2" />
      <path d="M12 14v3.5" />
      <path d="M8.5 20.5h7" />
      <path d="M9.5 17.5h5l1 3h-7Z" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m20 20-4.4-4.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 14.5a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.84 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.33 1.7 1.7 0 0 0-1.03 1.55V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .33-1.88 1.7 1.7 0 0 0-1.55-1.03H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.88l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.88.33H9a1.7 1.7 0 0 0 1-1.55V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1.03 1.55 1.7 1.7 0 0 0 1.87-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.33 1.87V9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1.03Z" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1.3" />
      <circle cx="12" cy="12" r="1.3" />
      <circle cx="19" cy="12" r="1.3" />
    </>
  ),
  heart: (
    <path d="M12 20.3s-7.4-4.6-7.4-9.7a4.4 4.4 0 0 1 7.4-3.2 4.4 4.4 0 0 1 7.4 3.2c0 5.1-7.4 9.7-7.4 9.7Z" />
  ),
  flame: (
    <>
      <path d="M12 3.5s5 4 5 8.5a5 5 0 0 1-10 0c0-1.8 1-3.4 2-4.5 0 1.4.8 2.3 1.7 2.3 1.2 0 1.8-1.2 1.8-2.8 0-1.4-.5-2.6-.5-3.5Z" />
    </>
  ),
  camera: (
    <>
      <path d="M3.5 8.5h3L8 6h8l1.5 2.5h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-17a1 1 0 0 1-1-1v-9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13.5" r="3.5" />
    </>
  ),
  letter: (
    <>
      <rect x="3" y="5.5" width="18" height="13" rx="2" />
      <path d="m3.5 7 8.5 6 8.5-6" />
    </>
  ),
  lock: (
    <>
      <rect x="4.5" y="10" width="15" height="10.5" rx="2.5" />
      <path d="M8 10V7.5a4 4 0 0 1 8 0V10" />
      <path d="M12 14v2.5" />
    </>
  ),
  cake: (
    <>
      <path d="M4.5 21h15" />
      <path d="M4.5 21v-6a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v6" />
      <path d="M4.5 16.5c1.5 0 1.5 1.3 3 1.3s1.5-1.3 3-1.3 1.5 1.3 3 1.3 1.5-1.3 3-1.3 1.5 1.3 3 1.3" />
      <path d="M12 13V9.5" />
      <path d="M12 6.5c.9 0 1.4-.6 1.4-1.3S12 2.5 12 2.5s-1.4 2-1.4 2.7.5 1.3 1.4 1.3Z" />
    </>
  ),
  bolt: <path d="M13.5 3 5 13.5h6L10.5 21 19 10.5h-6Z" />,
  sparkle: (
    <>
      <path d="M12 3.5 13.7 9l5.3 1.7-5.3 1.8L12 18l-1.7-5.5L5 10.7 10.3 9Z" />
      <path d="M18.5 16.5l.6 1.9 1.9.6-1.9.6-.6 1.9-.6-1.9-1.9-.6 1.9-.6Z" />
    </>
  ),
  // An open book: the handbook you write for each other.
  handbook: (
    <>
      <path d="M12 6.5C10.5 5 8.7 4.3 6 4.3A1.5 1.5 0 0 0 4.5 5.8v10.4A1.5 1.5 0 0 0 6 17.7c2.7 0 4.5.7 6 2.2" />
      <path d="M12 6.5c1.5-1.5 3.3-2.2 6-2.2a1.5 1.5 0 0 1 1.5 1.5v10.4a1.5 1.5 0 0 1-1.5 1.5c-2.7 0-4.5.7-6 2.2" />
      <path d="M12 6.5v13.4" />
    </>
  ),
  // A pail. Literal, but it reads instantly at 17px, which abstract ones
  // for this concept do not.
  bucket: (
    <>
      <path d="M4.5 7h15l-1.4 12.2a2 2 0 0 1-2 1.8H7.9a2 2 0 0 1-2-1.8Z" />
      <path d="M3.5 7h17" />
      <path d="M8.5 7a3.5 3.5 0 0 1 7 0" />
    </>
  ),
  dice: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="4" />
      <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="15.5" cy="15.5" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
    </>
  ),
  pencil: (
    <>
      <path d="M16.5 3.9a2.1 2.1 0 0 1 3 3L8.5 17.9 4 19.5l1.6-4.5Z" />
      <path d="m14.5 5.9 3 3" />
    </>
  ),
}

export default function Icon({
  name,
  size = 18,
  className,
  /** Filled rather than drawn — for the heart and flame in the header. */
  filled = false,
}: {
  name: IconName
  size?: number
  className?: string
  filled?: boolean
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      // Decorative in every use so far: each one sits beside its own label.
      aria-hidden="true"
      focusable="false"
      className={className}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  )
}
