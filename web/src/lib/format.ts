import { format, formatDistanceToNowStrict, isToday, isYesterday, parseISO } from 'date-fns'

export function when(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = parseISO(iso)
  if (isToday(d)) return format(d, "'today at' h:mm a")
  if (isYesterday(d)) return format(d, "'yesterday at' h:mm a")
  return format(d, 'd MMM yyyy')
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return ''
  return `${formatDistanceToNowStrict(parseISO(iso))} ago`
}

export function longDate(iso: string | null | undefined): string {
  if (!iso) return ''
  return format(parseISO(iso), 'd MMMM yyyy')
}

/** "in 3 days" / "in 4 hours" — the wait, phrased kindly. */
export function untilUnlock(iso: string | null): string {
  if (!iso) return ''
  const target = parseISO(iso)
  if (target.getTime() <= Date.now()) return 'ready now'
  return `opens in ${formatDistanceToNowStrict(target)}`
}

export function initials(name: string | null | undefined): string {
  if (!name) return '·'
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

/** Days together, for the header. */
export function daysSince(iso: string | null | undefined): number | null {
  if (!iso) return null
  const start = parseISO(iso).getTime()
  if (Number.isNaN(start)) return null
  return Math.max(0, Math.floor((Date.now() - start) / 86_400_000))
}
