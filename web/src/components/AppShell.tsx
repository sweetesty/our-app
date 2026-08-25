import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../context/SessionProvider'
import { useDaysSince } from '../lib/useDaysSince'
import InAppAlerts from './InAppAlerts'
import Logo from './Logo'
import { cx } from './ui'

const NAV = [
  { to: '/', icon: '✨', label: 'Today', end: true },
  { to: '/moments', icon: '📸', label: 'Moments' },
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
          <Logo size={34} />
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
          <NavItem key={item.to} {...item} />
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
}: {
  to: string
  icon: string
  label: string
  end?: boolean
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
    </NavLink>
  )
}
