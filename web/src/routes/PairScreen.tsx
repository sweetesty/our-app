import { useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { Button, ErrorNote, Field, Input } from '../components/ui'
import type { Couple } from '../lib/types'

/**
 * The only moment the app touches anyone else. One of you opens the space and
 * gets a six-character code; the other types it in. After that the door closes —
 * join_couple() refuses a third person at the database level.
 */
export default function PairScreen() {
  const { refresh, signOut } = useSession()
  const [choice, setChoice] = useState<'idle' | 'created' | 'joining'>('idle')
  const [couple, setCouple] = useState<Couple | null>(null)
  const [spaceName, setSpaceName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [showCreate, setShowCreate] = useState(false)

  // While one of you sits on the "waiting for them" screen, nothing tells it
  // the other has joined — so poll. Cheap, and it means the screen changes by
  // itself the moment they're in, rather than needing a manual refresh.
  useEffect(() => {
    if (choice !== 'created') return
    const timer = setInterval(() => void refresh(), 4000)
    return () => clearInterval(timer)
  }, [choice, refresh])

  async function createSpace() {
    setBusy(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('create_couple', {
      couple_name: spaceName.trim() || null,
    })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    setCouple(data as Couple)
    setChoice('created')
  }

  /** Undo an accidental "open a new space" and go join theirs instead. */
  async function startOver() {
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('leave_couple')
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    setCouple(null)
    setChoice('joining')
    await refresh()
  }

  async function join() {
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('join_couple', { code: code.trim() })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    await refresh()
  }

  async function copyCode() {
    if (!couple) return
    await navigator.clipboard.writeText(couple.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="animate-rise w-full max-w-md space-y-6">
        {choice === 'created' && couple ? (
          <div className="paper space-y-5 p-7 text-center">
            <p className="text-4xl">🔑</p>
            <div className="space-y-2">
              <h1 className="text-3xl text-ink">Your space is open</h1>
              <p className="text-sm leading-relaxed text-ink-muted">
                Send this code to them. It only works once, and only for one person.
              </p>
            </div>

            <button
              onClick={copyCode}
              className="w-full rounded-2xl border border-lav-500/40 bg-canvas/60 py-6 transition-colors hover:bg-canvas"
            >
              <span className="font-display text-5xl tracking-[0.3em] text-lav-300">
                {couple.invite_code}
              </span>
              <span className="mt-2 block text-xs text-ink-faint">
                {copied ? 'copied ✓' : 'tap to copy'}
              </span>
            </button>

            <p className="text-xs leading-relaxed text-ink-faint">
              Waiting for them to join. You can look around in the meantime — everything
              you write is already private to this space.
            </p>
            <Button variant="ghost" className="w-full" onClick={() => void refresh()}>
              I've sent it, take me in
            </Button>

            {/* The escape hatch. Someone who had a code and tapped the wrong
                button lands here, and without this there is no way back. */}
            <button
              onClick={() => void startOver()}
              className="mx-auto block text-xs text-rose-400 underline-offset-4 hover:text-rose-200 hover:underline"
            >
              Wrong turn — I actually have a code
            </button>
          </div>
        ) : choice === 'joining' ? (
          <div className="surface space-y-5 p-7">
            <div className="space-y-2 text-center">
              <p className="text-4xl">💌</p>
              <h1 className="text-3xl text-ink">Got a code?</h1>
              <p className="text-sm text-ink-muted">The six characters they sent you.</p>
            </div>

            <Field label="Invite code">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC123"
                maxLength={6}
                autoCapitalize="characters"
                autoComplete="off"
                className="text-center font-display text-3xl tracking-[0.28em]"
              />
            </Field>

            {error && <ErrorNote>{error}</ErrorNote>}

            <Button
              size="lg"
              className="w-full"
              loading={busy}
              disabled={code.trim().length < 6}
              onClick={() => void join()}
            >
              Open the door
            </Button>
            <Button variant="quiet" className="w-full" onClick={() => setChoice('idle')}>
              Back
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-2 text-center">
              <p className="text-4xl">🚪</p>
              <h1 className="text-3xl text-ink">One space, two people</h1>
              <p className="text-sm leading-relaxed text-ink-muted">
                Which one are you?
              </p>
            </div>

            {error && <ErrorNote>{error}</ErrorNote>}

            {/* "I have a code" comes first and carries equal weight. The
                invited person is the one most likely to be here, and burying
                this under a primary "create" button is how they end up alone
                in a space of their own. */}
            <button
              onClick={() => setChoice('joining')}
              className="w-full rounded-3xl border border-pink-500/40 bg-pink-500/10 p-5 text-left transition hover:border-pink-500/70"
            >
              <span className="mb-1 block text-2xl">💌</span>
              <span className="block text-base font-bold text-white">
                Someone sent me a code
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-rose-300">
                They've already made the space. Join theirs — don't make a
                second one.
              </span>
            </button>

            <button
              onClick={() => setShowCreate((v) => !v)}
              className="w-full rounded-3xl border border-rose-700/40 bg-rose-900/30 p-5 text-left transition hover:border-rose-600/60"
            >
              <span className="mb-1 block text-2xl">🕯️</span>
              <span className="block text-base font-bold text-white">
                I'm starting ours
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-rose-300">
                Opens a new space and gives you a code to send them.
              </span>
            </button>

            {showCreate && (
              <div className="surface animate-rise space-y-4 p-6">
                <Field label="Name your space" hint="Optional. You can change it later.">
                  <Input
                    value={spaceName}
                    onChange={(e) => setSpaceName(e.target.value)}
                    placeholder="Us"
                    maxLength={40}
                  />
                </Field>
                <Button
                  size="lg"
                  className="w-full"
                  loading={busy}
                  onClick={() => void createSpace()}
                >
                  Open a new space
                </Button>
              </div>
            )}
          </>
        )}

        <button
          onClick={() => void signOut()}
          className="mx-auto block text-xs text-ink-faint underline-offset-4 hover:underline"
        >
          Sign out
        </button>
      </div>
    </div>
  )
}
