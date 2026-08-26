import { NavLink, useLocation } from 'react-router-dom'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { signedUrl } from '../lib/media'
import { useSession } from '../context/SessionProvider'
import { useDaysSince } from '../lib/useDaysSince'
import InAppAlerts from './InAppAlerts'
import Logo from './Logo'
import { cx } from './ui'

const NAV = [
  { to: '/', icon: '✨', label: 'Today', end: true },
  { to: '/moments', icon: '📸', label: 'Moments' },
  { to: '/chat', icon: '💬', label: 'Chat' },
  { to: '/cards', icon: '🃏', label: 'Cards' },
  { to: '/notes', icon: '📌', label: 'Notes' },
  { to: '/timeline', icon: '🗓️', label: 'Timeline' },
  { to: '/memories', icon: '🖼️', label: 'Memories' },
  { to: '/vault', icon: '🎁', label: 'Vault' },
  { to: '/nudges', icon: '🫂', label: 'Nudges' },
  { to: '/us', icon: '🏆', label: 'Us' },
  { to: '/search', icon: '🔎', label: 'Search' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
]

export default function AppShell({ children }: { children: ReactNode }) {
  const { summary } = useSession()
  const { pathname } = useLocation()
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
              <span>
                <strong className="text-white">{together.toLocaleString()}</strong> days 💗
              </span>
            )}
            {together !== null && streak > 0 && (
              <span aria-hidden className="text-rose-700">
                |
              </span>
            )}
            {streak > 0 && (
              <span title="Days you've both answered in a row">
                <strong className="text-white">{streak}</strong> 🔥
              </span>
            )}
            {together === null && streak === 0 && <span>Just the two of you 💗</span>}
          </span>
        </div>
      </header>

      {/* Main Navigation Tabs */}
      {/* Twelve tabs on a 360px screen is a scroll strip whatever you do. The
          part that was missing is that it never scrolled itself — land on
          Settings from a notification and the active tab was three swipes off
          the right edge with nothing to say so. */}
      <nav className="scrollbar-none flex shrink-0 gap-2 overflow-x-auto border-b border-rose-800/30 bg-rose-950/40 px-4 py-3 sm:px-6">
        {NAV.map((item) => (
          <NavItem
            key={item.to}
            {...item}
            active={
              item.end ? pathname === item.to : pathname.startsWith(item.to)
            }
            // Unread counts belong on the tab, not only on the app icon —
            // the icon badge is invisible once you are already inside.
            badge={
              item.to === '/chat'
                ? (summary?.unread_messages ?? 0)
                : item.to === '/notes'
                  ? (summary?.unread_notes ?? 0)
                  : 0
            }
          />
        ))}
      </nav>

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
            : // Clear the home indicator on gesture-navigation phones.
              { paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))' }
        }
      >
        {children}
      </main>
    </div>
  )
}

function NavItem({
  to,
  icon,
  label,
  end,
  active,
  badge = 0,
}: {
  to: string
  icon: string
  label: string
  end?: boolean
  active: boolean
  badge?: number
}) {
  const ref = useRef<HTMLAnchorElement>(null)

  // Bring the current tab into the strip. `nearest` so it only moves when the
  // tab is actually out of view, and never scrolls the page itself.
  useEffect(() => {
    if (!active) return
    ref.current?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [active])

  return (
    <NavLink
      ref={ref}
      to={to}
      end={end}
      className={({ isActive }) =>
        cx(
          'tab-btn font-medium whitespace-nowrap shrink-0 flex items-center gap-1.5',
          isActive
            ? 'bg-rose-600 text-white shadow-lg shadow-rose-900/40 font-semibold'
            : 'text-rose-200 hover:bg-rose-900/40'
        )
      }
    >
      <span>{icon}</span>
      <span>{label}</span>
      {badge > 0 && (
        <span className="grid min-w-5 place-items-center rounded-full bg-pink-500 px-1.5 text-[0.65rem] font-bold text-white">
          {badge > 9 ? '9+' : badge}
        </span>
      )}
    </NavLink>
  )
}
