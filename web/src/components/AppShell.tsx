import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
import { signedUrl } from '../lib/media'
import { useSession } from '../context/SessionProvider'
import { useDaysSince } from '../lib/useDaysSince'
import InAppAlerts from './InAppAlerts'
import Logo from './Logo'
import Icon, { type IconName } from './Icon'
import { cx } from './ui'

const NAV: { to: string; icon: IconName; label: string; end?: boolean }[] = [
  { to: '/', icon: 'today', label: 'Today', end: true },
  { to: '/moments', icon: 'moments', label: 'Moments' },
  { to: '/chat', icon: 'chat', label: 'Chat' },
  { to: '/cards', icon: 'cards', label: 'Cards' },
  { to: '/notes', icon: 'notes', label: 'Notes' },
  { to: '/timeline', icon: 'timeline', label: 'Timeline' },
  { to: '/memories', icon: 'memories', label: 'Memories' },
  { to: '/vault', icon: 'vault', label: 'Vault' },
  { to: '/handbook', icon: 'handbook', label: 'Handbook' },
  { to: '/bucket', icon: 'bucket', label: 'Bucket list' },
  { to: '/date', icon: 'dice', label: 'Date night' },
  { to: '/nudges', icon: 'nudges', label: 'Nudges' },
  { to: '/us', icon: 'us', label: 'Us' },
  { to: '/search', icon: 'search', label: 'Search' },
  { to: '/settings', icon: 'settings', label: 'Settings' },
]

/** The four the app starts you with — the ones most couples open daily. */
const DEFAULT_PINNED = ['/', '/chat', '/moments', '/cards']

/** Icons that read better solid when you're on that tab. */
const FILLABLE = new Set<IconName>(['heart', 'flame', 'bolt', 'sparkle'])

const PINNED_KEY = 'ours:pinned-tabs'

/**
 * Which four are on the bar. Per device rather than per couple: you each use
 * the app differently, and one of you pinning Vault shouldn't move the other's
 * thumb.
 */
function readPinned(): string[] {
  try {
    const raw = localStorage.getItem(PINNED_KEY)
    const saved = raw ? (JSON.parse(raw) as string[]) : null
    // Filtered against NAV so a tab removed in a later version can't leave a
    // dead button on the bar.
    const valid = saved?.filter((p) => NAV.some((n) => n.to === p)) ?? []
    return valid.length > 0 ? valid.slice(0, 4) : DEFAULT_PINNED
  } catch {
    return DEFAULT_PINNED
  }
}

export default function AppShell({ children }: { children: ReactNode }) {
  const { summary } = useSession()
  const { pathname } = useLocation()

  const [drawerOpen, setDrawerOpen] = useState(false)
  const [pinned, setPinnedState] = useState<string[]>(readPinned)

  function setPinned(next: string[]) {
    setPinnedState(next)
    try {
      localStorage.setItem(PINNED_KEY, JSON.stringify(next))
    } catch {
      /* no store, no memory of it — the bar still works this session */
    }
  }

  // Ordered by NAV, not by when you pinned them, so the bar doesn't reshuffle
  // itself under your thumb.
  const pinnedItems = NAV.filter((n) => pinned.includes(n.to))

  // Unread counts belong on the tab, not only on the app icon — the icon badge
  // is invisible once you are already inside.
  const badgeFor = (to: string) =>
    to === '/chat'
      ? (summary?.unread_messages ?? 0)
      : to === '/notes'
        ? (summary?.unread_notes ?? 0)
        : 0

  // Anything unread that isn't on the bar has to surface on More, or it is
  // simply invisible.
  const restBadge = NAV.filter((n) => !pinned.includes(n.to)).reduce(
    (sum, n) => sum + badgeFor(n.to),
    0,
  )
  const restActive = !pinnedItems.some((n) =>
    n.end ? pathname === n.to : pathname.startsWith(n.to),
  )

  // Navigating away closes it — otherwise tapping a destination leaves the
  // sheet sitting over the screen you just asked for.
  useEffect(() => {
    setDrawerOpen(false)
  }, [pathname])
  /** Screens that need the whole box and do their own scrolling. */
  const ownsItsScrolling = pathname.startsWith('/chat')
  const couple = summary?.couple
  // The header said "Streak" but showed days-since-anniversary, which is a
  // different number entirely — and read as 0 for anyone who never set one.
  const streak = summary?.stats?.current_streak ?? 0
  const together = useDaysSince(couple?.anniversary)

  /**
   * The shell's height, measured rather than assumed.
   *
   * iOS does not shrink the layout viewport when the keyboard comes up — it
   * leaves the page its full height and slides it up behind the keys. So a
   * shell sized with 100dvh keeps its bottom row somewhere under the keyboard,
   * which is how the composer ended up stranded in the middle of the screen
   * with messages visible below it.
   *
   * visualViewport is the part actually on screen, keyboard subtracted. The
   * scrollTo undoes the shove iOS gives the page on the way in; without it the
   * header goes up under the status bar and stays there.
   */
  // Hand the document over to the shell while it is mounted: no page scroll,
  // exactly viewport height. Removed on unmount so the landing and sign-in
  // pages stay ordinary scrolling pages.
  useEffect(() => {
    document.documentElement.classList.add('app-shell')
    return () => document.documentElement.classList.remove('app-shell')
  }, [])

  useEffect(() => {
    const view = window.visualViewport
    if (!view) return

    const measure = () => {
      document.documentElement.style.setProperty('--app-height', `${view.height}px`)
      if (view.offsetTop > 0) window.scrollTo(0, 0)
    }

    measure()
    view.addEventListener('resize', measure)
    view.addEventListener('scroll', measure)

    return () => {
      view.removeEventListener('resize', measure)
      view.removeEventListener('scroll', measure)
      document.documentElement.style.removeProperty('--app-height')
    }
  }, [])

  // Stored as a storage path, so it needs signing before it can be shown.
  const [coupleAvatar, setCoupleAvatar] = useState<string | null>(null)
  useEffect(() => {
    if (!couple?.avatar_url) return setCoupleAvatar(null)
    void signedUrl(couple.avatar_url).then(setCoupleAvatar)
  }, [couple?.avatar_url])

  return (
    /* A fixed shell with one scrolling pane, rather than one long scrolling
       page.

       The page-scroll version meant the chat composer was `sticky bottom-0`
       against a container whose bottom edge moved with the document — so
       scrolling up through the thread dragged the composer up off the bottom of
       the screen with it. Sticky can only pin to the bottom of the thing that
       scrolls, so the thing that scrolls has to be the content pane.

       It also stops the browser chrome from growing and shrinking under the
       header on every flick, which is what made the header appear to jump. */
    <div
      className="flex flex-col overflow-hidden text-rose-50 selection:bg-rose-500 selection:text-white"
      // dvh is the fallback for anything without visualViewport; the measured
      // value wins the moment there is one.
      style={{ height: 'var(--app-height, 100dvh)' }}
    >
      <InAppAlerts />

      {/* Top Navigation / Header */}
      {/* The status bar sits over the page on an installed PWA, so the clock
          and battery were landing on top of the title. Pad by the safe-area
          inset — max() keeps normal spacing on phones that report none. */}
      {/* Everything here shrinks before it wraps. At 360px the title and the
          tagline were folding onto three lines and pushing the day count off
          the row — a header taller than the content under it. */}
      <header
        className="dark-glass z-50 flex w-full shrink-0 items-center justify-between gap-2 border-b border-rose-800/40 px-4 pb-3 sm:gap-4 sm:px-6 sm:pb-4"
        style={{ paddingTop: 'max(0.875rem, calc(env(safe-area-inset-top) + 0.5rem))' }}
      >
        <div className="flex min-w-0 items-center gap-2.5 sm:gap-3">
          {/* Their photo if they chose one, otherwise the swans. */}
          {coupleAvatar ? (
            <img
              src={coupleAvatar}
              alt=""
              className="size-9 shrink-0 rounded-full object-cover ring-1 ring-rose-600/50"
            />
          ) : (
            <Logo size={34} />
          )}
          <div className="min-w-0">
            <h1 className="truncate text-base font-bold tracking-wide text-white sm:text-lg">
              Our Little World
            </h1>
            <p className="truncate text-[0.7rem] text-rose-300 sm:text-xs">
              Private Space • Secured for Two
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-rose-700/50 bg-rose-950/60 px-2.5 py-1.5 sm:gap-2 sm:px-3">
          <span className="size-2 shrink-0 animate-ping rounded-full bg-emerald-400 sm:size-2.5"></span>
          {/* Two different numbers were sharing one label. Days together is the
              relationship; the streak is only consecutive days you have both
              answered — so "Streak: 1" next to a 37-day relationship read as
              though the app had forgotten. Show both, labelled. */}
          <span className="flex items-center gap-1.5 text-[0.7rem] font-medium whitespace-nowrap text-rose-200 sm:gap-2 sm:text-xs">
            {together !== null && (
              <span className="flex items-center gap-1">
                <strong className="text-white">{together.toLocaleString()}</strong> days
                <Icon name="heart" size={12} filled className="text-pink-400" />
              </span>
            )}
            {together !== null && streak > 0 && (
              <span aria-hidden className="text-rose-700">
                |
              </span>
            )}
            {streak > 0 && (
              <span
                title="Days you've both answered in a row"
                className="flex items-center gap-1"
              >
                <strong className="text-white">{streak}</strong>
                <Icon name="flame" size={12} filled className="text-amber-400" />
              </span>
            )}
            {together === null && streak === 0 && (
              <span className="flex items-center gap-1">
                Just the two of you
                <Icon name="heart" size={12} filled className="text-pink-400" />
              </span>
            )}
          </span>
        </div>
      </header>

      {/* App Container */}
      {/* The content pane. min-h-0 is what lets it scroll: a flex child will
          not shrink below its content without it, and the pane would grow the
          shell instead of scrolling inside it.

          Chat is the exception. It has a composer that must sit on the bottom
          edge and never move, which means the thread has to be its own scroll
          area with the composer outside it — so that screen gets the box
          unpadded and unscrolled, and manages both itself. Anything sticky in
          a padded scroll container ends up floating above the padding with
          content sliding underneath it, which is exactly what it looked like. */}
      <main
        className={cx(
          'mx-auto flex w-full max-w-2xl min-w-0 min-h-0 flex-1 flex-col',
          ownsItsScrolling
            ? 'overflow-hidden'
            : // shrink-0 on the children is not optional. This is a column
              // flex container with a bounded height now, and a flex child
              // shrinks below its content by default when the box is too
              // small — so the short rows collapsed to a few pixels while the
              // tall ones kept their size. Screens looked like they had lost
              // their filter chips. They scroll instead.
              'gap-5 overflow-y-auto px-4 py-5 [&>*]:shrink-0 sm:gap-6 sm:p-6',
        )}
        style={
          ownsItsScrolling
            ? undefined
            : // The tab bar below owns the home-indicator inset now, so this
              // is ordinary breathing room rather than a safe-area clearance.
              { paddingBottom: '1.5rem' }
        }
      >
        {children}
      </main>

      {/* Four pinned, then everything else.
          Fifteen destinations in one scrolling strip meant you were always
          hunting: the four you use hourly were the same swipe away as the ones
          you open monthly, and the strip had to scroll itself to show you where
          you were. Four fixed tabs and a drawer is the trade — one tap for the
          things you actually use, two for the rest, and nothing ever scrolls
          sideways. Which four is your choice, kept per device. */}
      <nav
        className="dark-glass z-40 flex shrink-0 items-stretch gap-1 border-t border-rose-800/40 px-2 pt-1.5"
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
      >
        {pinnedItems.map((item) => (
          <TabButton
            key={item.to}
            {...item}
            active={item.end ? pathname === item.to : pathname.startsWith(item.to)}
            badge={badgeFor(item.to)}
          />
        ))}

        <button
          onClick={() => setDrawerOpen(true)}
          aria-label="Everything else"
          className={cx(
            'flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition',
            // The drawer's own tab lights up when you're on a screen that
            // lives inside it — otherwise being on Vault looks like being
            // nowhere at all.
            restActive ? 'text-white' : 'text-rose-300 hover:text-rose-100',
          )}
        >
          <span className="relative">
            <Icon name="more" size={21} />
            {restBadge > 0 && (
              <span className="absolute -top-1 -right-2 grid min-w-4 place-items-center rounded-full bg-pink-500 px-1 text-[0.6rem] font-bold text-white">
                {restBadge > 9 ? '9+' : restBadge}
              </span>
            )}
          </span>
          <span className="text-[0.65rem] font-medium">More</span>
        </button>
      </nav>

      {drawerOpen && (
        <MoreDrawer
          items={NAV}
          pinned={pinned}
          onPin={setPinned}
          badgeFor={badgeFor}
          pathname={pathname}
          onClose={() => setDrawerOpen(false)}
        />
      )}
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function TabButton({
  to,
  icon,
  label,
  end,
  active,
  badge = 0,
}: {
  to: string
  icon: IconName
  label: string
  end?: boolean
  active: boolean
  badge?: number
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={cx(
        'flex flex-1 flex-col items-center gap-1 rounded-xl py-1.5 transition',
        active ? 'text-white' : 'text-rose-300 hover:text-rose-100',
      )}
    >
      <span className="relative">
        {/* Filled when you're on it. At this size a stroke-weight change is
            not enough to read as "here" on a phone at arm's length. */}
        <Icon name={icon} size={21} filled={active && FILLABLE.has(icon)} />
        {badge > 0 && (
          <span className="absolute -top-1 -right-2 grid min-w-4 place-items-center rounded-full bg-pink-500 px-1 text-[0.6rem] font-bold text-white">
            {badge > 9 ? '9+' : badge}
          </span>
        )}
      </span>
      <span className={cx('text-[0.65rem]', active ? 'font-bold' : 'font-medium')}>
        {label}
      </span>
      {active && <span className="h-0.5 w-5 rounded-full bg-pink-500" />}
    </NavLink>
  )
}

/**
 * Everything that isn't pinned.
 *
 * A grid rather than a list, because eleven destinations as a list is a scroll
 * and the whole point of this was to stop scrolling to find things. Tapping the
 * pin on one swaps it onto the bar.
 */
function MoreDrawer({
  items,
  pinned,
  onPin,
  badgeFor,
  pathname,
  onClose,
}: {
  items: typeof NAV
  pinned: string[]
  onPin: (next: string[]) => void
  badgeFor: (to: string) => number
  pathname: string
  onClose: () => void
}) {
  const [editing, setEditing] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  function togglePin(to: string) {
    // Always exactly four: pinning a fifth pushes the oldest off, which is
    // less annoying than being told to unpin something first.
    onPin(pinned.includes(to) ? pinned.filter((p) => p !== to) : [...pinned, to].slice(-4))
  }

  return (
    <div
      className="fixed inset-x-0 top-0 z-50 flex items-end justify-center bg-scrim/70 backdrop-blur-sm"
      style={{ height: 'var(--app-height, 100dvh)' }}
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Everything else"
        onClick={(e) => e.stopPropagation()}
        className="animate-rise max-h-[85%] w-full max-w-md overflow-y-auto rounded-t-3xl border border-rose-700/60 bg-rose-950 p-5"
        style={{ paddingBottom: 'max(1.25rem, calc(env(safe-area-inset-bottom) + 0.75rem))' }}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-white">Everything else</h2>
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded-xl bg-rose-900/60 px-3 py-1.5 text-xs font-semibold text-rose-200 transition hover:bg-rose-900"
          >
            {editing ? 'Done' : 'Choose my four'}
          </button>
        </div>

        {editing && (
          <p className="mb-3 text-xs text-rose-400">
            Tap to pin or unpin. Four fit on the bar — a fifth pushes the oldest off.
          </p>
        )}

        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {items.map((item) => {
            const on = pinned.includes(item.to)
            const here = item.end ? pathname === item.to : pathname.startsWith(item.to)
            const badge = badgeFor(item.to)

            const inner = (
              <>
                <span className="relative">
                  <Icon name={item.icon} size={24} />
                  {badge > 0 && (
                    <span className="absolute -top-1.5 -right-2.5 grid min-w-4 place-items-center rounded-full bg-pink-500 px-1 text-[0.6rem] font-bold text-white">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className="text-center text-[0.7rem] leading-tight">{item.label}</span>
                {editing && (
                  <span
                    className={cx(
                      'text-[0.6rem] font-semibold tracking-wide uppercase',
                      on ? 'text-pink-300' : 'text-rose-600',
                    )}
                  >
                    {on ? 'pinned' : 'pin'}
                  </span>
                )}
              </>
            )

            const className = cx(
              'flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition',
              here
                ? 'border-pink-500/50 bg-pink-500/10 text-white'
                : on && editing
                  ? 'border-pink-500/40 bg-rose-900/40 text-rose-100'
                  : 'border-rose-700/30 bg-rose-900/25 text-rose-200 hover:bg-rose-900/50',
            )

            return editing ? (
              <button key={item.to} onClick={() => togglePin(item.to)} className={className}>
                {inner}
              </button>
            ) : (
              <NavLink key={item.to} to={item.to} end={item.end} onClick={onClose} className={className}>
                {inner}
              </NavLink>
            )
          })}
        </div>
      </div>
    </div>
  )
}

