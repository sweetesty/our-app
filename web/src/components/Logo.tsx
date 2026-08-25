/**
 * The product is called Our Little World; the artwork is a pair of swans.
 *
 * Only the birds-only crop is used. The full lockup PNG has "SWAN" printed in
 * it, which is a different name, so the wordmark is set in type instead — that
 * also means renaming the product later is a one-line change here rather than
 * a trip back to an image editor.
 */

const MARK_SRC = '/logo-mark.png'

export const APP_NAME = 'Our Little World'
export const APP_TAGLINE = 'a world for just us'

/** Just the birds. */
export default function Logo({
  size = 48,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <img
      src={MARK_SRC}
      alt=""
      aria-hidden
      width={size}
      height={size}
      className={className}
      // contain, not cover: the artwork is wider than it is tall and cover
      // would clip the wingtips.
      style={{ width: size, height: size, objectFit: 'contain' }}
    />
  )
}

/** Mark, name and tagline stacked — for the sign-in and landing hero. */
export function LogoLockup({
  size = 84,
  tagline = true,
}: {
  size?: number
  tagline?: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-3">
      <Logo size={size} />
      <div className="text-center">
        <h1 className="text-2xl font-bold tracking-wide text-white">{APP_NAME}</h1>
        {tagline && <p className="mt-1 text-sm text-rose-300">{APP_TAGLINE}</p>}
      </div>
    </div>
  )
}
