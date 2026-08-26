import { useEffect } from 'react'
import { useSession } from '../context/SessionProvider'
import { applyAppearance } from '../lib/appearance'

/**
 * Keeps <html> in step with the couple's chosen palette.
 *
 * Renders nothing. Sits at the root so a change made on one phone lands on the
 * other as soon as home_summary refreshes, rather than waiting for a reload.
 */
export default function ThemeSync() {
  const { summary } = useSession()
  const accent = summary?.couple?.accent
  const background = summary?.couple?.background

  useEffect(() => {
    applyAppearance(accent, background)
  }, [accent, background])

  return null
}
