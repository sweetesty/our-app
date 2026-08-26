import { NavLink } from 'react-router-dom'
import { useEffect, useState, type ReactNode } from 'react'
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
  { to: '/settings', icon: '⚙️', label: 'Settings' },
]

export default function AppShell({ children }: { children: ReactNode }) {
  const { summary } = useSession()
  const couple = summary?.couple
  // The header said "Streak" but showed days-since-anniversary, which is a
  // different number entirely — and read as 0 for anyone who never set one.
  const streak = summary?.stats?.current_streak ?? 0
  const together = useDaysSince(couple?.anniversary)

  // Stored as a storage path, so it needs signing before it can be shown.
  const [coupleAvatar, setCoupleAvatar] = useState<string | null>(null)
  useEffect(() => {
    if (!couple?.avatar_url) return setCoupleAvatar(null)
    void signedUrl(couple.avatar_url).then(setCoupleAvatar)
  }, [couple?.avatar_url])

  return (
    <div className="min-h-dvh flex flex-col text-rose-50 selection:bg-rose-500 selection:text-white">
      <InAppAlerts />

      {/* Top Navigation / Header */}
      {/* The status bar sits over the page on an installed PWA, so the clock
          and battery were landing on top of the title. Pad by the safe-area
          inset — max() keeps normal spacing on phones that report none. */}
      <header
        className="dark-glass sticky top-0 z-50 flex w-full items-center justify-between border-b border-rose-800/40 px-6 pb-4"
        style={{ paddingTop: 'max(1rem, calc(env(safe-area-inset-top) + 0.5rem))' }}
      >
        <div className="flex items-center gap-3">
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
          <div>
            <h1 className="font-bold text-lg text-white tracking-wide">Our Little World</h1>
            <p className="text-xs text-rose-300">Private Space • Secured for Two</p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-rose-950/60 border border-rose-700/50 px-3 py-1.5 rounded-full">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
          {/* Two different numbers were sharing one label. Days together is the
              relationship; the streak is only consecutive days you have both
              answered — so "Streak: 1" next to a 37-day relationship read as
              though the app had forgotten. Show both, labelled. */}
          <span className="flex items-center gap-2 text-xs font-medium text-rose-200">
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
      <nav className="flex overflow-x-auto gap-2 px-6 py-3 bg-rose-950/40 border-b border-rose-800/30 scrollbar-none">
        {NAV.map((item) => (
          <NavItem
            key={item.to}
            {...item}
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
      <main
        className="mx-auto flex w-full max-w-2xl flex-grow flex-col gap-6 p-6"
        // Clear the home indicator on gesture-navigation phones.
        style={{ paddingBottom: 'max(1.5rem, calc(env(safe-area-inset-bottom) + 1rem))' }}
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
  badge = 0,
}: {
  to: string
  icon: string
  label: string
  end?: boolean
  badge?: number
}) {
  return (
    <NavLink
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
