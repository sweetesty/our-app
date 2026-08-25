import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errorMessage } from '../lib/supabase'
import { Button, ErrorNote, Field, Input } from '../components/ui'
import { LogoLockup } from '../components/Logo'

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    setNotice('')

    try {
      if (mode === 'signup') {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: { data: { display_name: displayName.trim() || email.split('@')[0] } },
        })
        if (signUpError) throw signUpError
        // With email confirmation on, there is no session yet — say so plainly
        // rather than leaving them on a screen that looks like it failed.
        if (!data.session) {
          setNotice('Check your email to confirm, then come back and sign in.')
          setMode('signin')
        }
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (signInError) throw signInError
      }
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="animate-rise w-full max-w-md">
        <div className="mb-8">
          <LogoLockup />
          <p className="mt-4 text-center text-sm leading-relaxed text-ink-muted">
            No profiles, no followers, no feed —
            <br className="hidden sm:block" /> just the two of you and everything you leave here.
          </p>
        </div>

        <form onSubmit={submit} className="surface space-y-5 p-6">
          {mode === 'signup' && (
            <Field label="What should they call you?">
              <Input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Esther"
                autoComplete="nickname"
              />
            </Field>
          )}

          <Field label="Email">
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </Field>

          <Field label="Password" hint={mode === 'signup' ? 'At least 6 characters.' : undefined}>
            <Input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            />
          </Field>

          {error && <ErrorNote>{error}</ErrorNote>}
          {notice && (
            <p className="rounded-xl border border-lav-500/30 bg-lav-400/10 px-4 py-3 text-sm text-lav-300">
              {notice}
            </p>
          )}

          <Button type="submit" size="lg" loading={busy} className="w-full">
            {mode === 'signup' ? 'Create my key' : 'Let me in'}
          </Button>

          <p className="text-center text-sm text-ink-faint">
            {mode === 'signup' ? 'Already have a key?' : 'First time here?'}{' '}
            <button
              type="button"
              onClick={() => {
                setMode(mode === 'signup' ? 'signin' : 'signup')
                setError('')
                setNotice('')
              }}
              className="font-medium text-lav-300 underline-offset-4 hover:underline"
            >
              {mode === 'signup' ? 'Sign in' : 'Make one'}
            </button>
          </p>
        </form>

        <div className="mt-6 flex items-center justify-center gap-4">
          <Link
            to="/"
            className="text-xs text-ink-faint underline-offset-4 transition-colors hover:text-ink-muted hover:underline"
          >
            ← What is Our Little World?
          </Link>
        </div>
      </div>
    </div>
  )
}
