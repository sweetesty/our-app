import { Navigate, Route, Routes } from 'react-router-dom'
import { useSession } from './context/SessionProvider'
import { Loading } from './components/ui'
import AppShell from './components/AppShell'
import InstallPrompt from './components/InstallPrompt'
import Landing from './routes/Landing'
import AuthScreen from './routes/AuthScreen'
import PairScreen from './routes/PairScreen'
import Today from './routes/Today'
import Cards from './routes/Cards'
import Notes from './routes/Notes'
import Timeline from './routes/Timeline'
import Vault from './routes/Vault'
import Nudges from './routes/Nudges'
import Us from './routes/Us'
import Settings from './routes/Settings'

export default function App() {
  const { session, ready, summary } = useSession()

  if (!ready) return <Loading label="Unlocking…" />

  // Three gates, in order: signed in, paired, then everything else.
  // Signed out, the root is the pitch rather than a login form — a stranger
  // arriving cold should learn what SWAN is before being asked for an email.
  if (!session) {
    return (
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/auth" element={<AuthScreen />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  if (!summary) return <Loading label="Finding your space…" />

  if (!summary.paired) {
    return (
      <Routes>
        <Route path="/pair" element={<PairScreen />} />
        <Route path="*" element={<Navigate to="/pair" replace />} />
      </Routes>
    )
  }

  return (
    <AppShell>
      <InstallPrompt />
      <Routes>
        <Route path="/" element={<Today />} />
        <Route path="/cards" element={<Cards />} />
        <Route path="/notes" element={<Notes />} />
        <Route path="/timeline" element={<Timeline />} />
        <Route path="/vault" element={<Vault />} />
        <Route path="/nudges" element={<Nudges />} />
        <Route path="/us" element={<Us />} />
        <Route path="/settings" element={<Settings />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  )
}
