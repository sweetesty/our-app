import { useState } from 'react'
import { cx } from './ui'

/**
 * An emoji, drawn the same on both your phones.
 *
 * Left to the font, an emoji is whatever the device decided it looks like:
 * Apple's on the iPhone, Google's flat pink-and-purple ones in Chrome on
 * Windows, something else again on Android. Two people looking at the same
 * nudge were not looking at the same picture.
 *
 * These are Twemoji SVGs, served from our own /emoji. One drawing everywhere,
 * scalable, a couple of kilobytes each, and only the ones on screen are ever
 * fetched. If one is missing — a brand-new emoji the set hasn't caught up with
 * — it falls back to the character itself, which is exactly what you had
 * before.
 */

/**
 * Twemoji's filenames are the codepoints in lowercase hex, joined by '-'.
 *
 * The variation selector U+FE0F is dropped, because the set files ❤ under
 * `2764` and not `2764-fe0f` — except inside a ZWJ sequence, where it is part
 * of how the sequence is spelled (❤️‍🔥 is `2764-fe0f-200d-1f525`). That
 * exception is the whole reason this is a function rather than a one-liner.
 */
export function emojiFile(emoji: string): string {
  const source = emoji.includes('‍') ? emoji : emoji.replace(/️/g, '')
  const points: string[] = []
  for (const char of source) points.push(char.codePointAt(0)!.toString(16))
  return points.join('-')
}

export default function Emoji({
  children: emoji,
  size = 20,
  className,
  label,
}: {
  children: string
  /** Rendered size in px. Falls back to this as a font-size if the file is missing. */
  size?: number
  className?: string
  /** Screen-reader text. Decorative by default — these sit beside their labels. */
  label?: string
}) {
  const [failed, setFailed] = useState(false)

  if (!emoji) return null

  if (failed) {
    return (
      <span
        role={label ? 'img' : undefined}
        aria-label={label}
        aria-hidden={label ? undefined : true}
        style={{ fontSize: size, lineHeight: 1 }}
        className={cx('inline-block align-middle', className)}
      >
        {emoji}
      </span>
    )
  }

  return (
    <img
      src={`/emoji/${emojiFile(emoji)}.svg`}
      alt={label ?? ''}
      aria-hidden={label ? undefined : true}
      width={size}
      height={size}
      draggable={false}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cx('inline-block shrink-0 align-middle select-none', className)}
      style={{ width: size, height: size }}
    />
  )
}
