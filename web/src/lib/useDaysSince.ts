import { useEffect, useState } from 'react'
import { daysSince } from './format'

/**
 * Days together, kept honest while the app stays open.
 *
 * daysSince() runs during render, so an installed PWA left open across midnight
 * kept drawing yesterday's number — one phone read 37 while the other, opened
 * fresh that morning, read 38. Neither person reloads a home-screen app, so it
 * stayed wrong all day.
 *
 * Recounts on two triggers: coming back to the foreground, and the next local
 * midnight for a phone that never left the page.
 */
export function useDaysSince(iso: string | null | undefined): number | null {
  const [value, setValue] = useState(() => daysSince(iso))

  useEffect(() => {
    const recount = () => setValue(daysSince(iso))
    recount()
    if (!iso) return

    document.addEventListener('visibilitychange', recount)

    // Reschedules itself, so it keeps counting past the first night rather
    // than firing once and going quiet. The few seconds past midnight keep it
    // clear of clock skew around the boundary.
    let timer = 0
    const schedule = () => {
      const next = new Date()
      next.setHours(24, 0, 5, 0)
      timer = window.setTimeout(() => {
        recount()
        schedule()
      }, next.getTime() - Date.now())
    }
    schedule()

    return () => {
      document.removeEventListener('visibilitychange', recount)
      window.clearTimeout(timer)
    }
  }, [iso])

  return value
}
