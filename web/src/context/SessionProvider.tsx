import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import type { HomeSummary } from '../lib/types'

type SessionValue = {
  session: Session | null
  /** Null until the first auth check finishes — used to avoid an auth flash. */
  ready: boolean
  summary: HomeSummary | null
  userId: string | null
  coupleId: string | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const Ctx = createContext<SessionValue | null>(null)

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [ready, setReady] = useState(false)
  const [summary, setSummary] = useState<HomeSummary | null>(null)

  const refresh = useCallback(async () => {
    const { data: auth } = await supabase.auth.getSession()
    if (!auth.session) {
      setSummary(null)
      return
    }
    const { data, error } = await supabase.rpc('home_summary')
    if (error) {
      console.error('home_summary failed', error)
      setSummary({ paired: false })
      return
    }
    setSummary(data as HomeSummary)
  }, [])

  useEffect(() => {
    let active = true

    supabase.auth.getSession().then(async ({ data }) => {
      if (!active) return
      setSession(data.session)
      if (data.session) await refresh()
      if (active) setReady(true)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next)
      if (next) {
        void refresh()
      } else {
        setSummary(null)
      }
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [refresh])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setSummary(null)
  }, [])

  const value = useMemo<SessionValue>(
    () => ({
      session,
      ready,
      summary,
      userId: session?.user.id ?? null,
      coupleId: summary?.couple?.id ?? null,
      refresh,
      signOut,
    }),
    [session, ready, summary, refresh, signOut],
  )

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSession() {
  const value = useContext(Ctx)
  if (!value) throw new Error('useSession must be used inside <SessionProvider>')
  return value
}

/** Convenience for screens that only render once a couple exists. */
// eslint-disable-next-line react-refresh/only-export-components
export function useCouple() {
  const { summary, userId, coupleId, refresh } = useSession()
  if (!coupleId || !userId) {
    throw new Error('useCouple used outside a paired route')
  }
  return {
    coupleId,
    userId,
    me: summary?.me ?? null,
    partner: summary?.partner ?? null,
    couple: summary?.couple ?? null,
    stats: summary?.stats ?? null,
    refresh,
  }
}
