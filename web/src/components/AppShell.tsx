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
  { to: '/vault', icon: '🎁', label: 'Vault' },
  { to: '/nudges', icon: '🫂', label: 'Nudges' },
  { to: '/us', icon: '🏆', label: 'Us' },
  { to: '/settings', icon: '⚙️', label: 'Settings' },
]

export default function AppShell({ children }: { children: ReactNode }) {
  const { summary } = useSession()
  const couple = summary?.couple
  const together = daysSince(couple?.anniversary) ?? 0

  return (
    <div className="min-h-dvh flex flex-col text-rose-50 selection:bg-rose-500 selection:text-white">
      <NudgeListener />

      {/* Top Navigation / Header */}
      <header className="w-full border-b border-rose-800/40 dark-glass sticky top-0 z-50 px-6 py-4 flex justify-between items-center">
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
            Streak: <strong className="text-white">{together}</strong> Days 🔥
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
      <main className="max-w-2xl w-full mx-auto p-6 flex-grow flex flex-col gap-6">
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
