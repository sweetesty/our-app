import { NavLink } from 'react-router-dom'
import type { ReactNode } from 'react'
import { useSession } from '../context/SessionProvider'
import { daysSince } from '../lib/format'
import NudgeListener from './NudgeListener'
import Logo from './Logo'
import { cx } from './ui'

const NAV = [
  { to: '/', icon: '✨', label: 'Today', end: true },
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
  const together = daysSince(couple?.anniversary)

  return (
    <div className="min-h-dvh flex flex-col text-rose-50 selection:bg-rose-500 selection:text-white">
      <NudgeListener />

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
          <span className="text-xs font-medium text-rose-200">
            {streak > 0 ? (
              <>
                Streak: <strong className="text-white">{streak}</strong> Days 🔥
              </>
            ) : together !== null ? (
              <>
                <strong className="text-white">{together.toLocaleString()}</strong> Days
                together 💗
              </>
            ) : (
              <>Just the two of you 💗</>
            )}
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
