import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { supabase, errorMessage } from '../lib/supabase'
import { Button, ErrorNote, Field, Input, PasswordInput } from '../components/ui'
import { LogoLockup } from '../components/Logo'

/** Google's mark, inlined so it does not depend on a CDN the CSP may block. */
function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.7 6.9l7.3 5.7c4.3-3.9 6.8-9.8 6.8-17.1z" />
      <path fill="#FBBC05" d="M10.4 28.7c-.5-1.4-.8-2.9-.8-4.7s.3-3.3.8-4.7l-7.8-6.1C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.8-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.3-5.7c-2 1.4-4.7 2.3-8.6 2.3-6.3 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  )
}

export default function AuthScreen() {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  /** Sends a recovery link. Supabase mails it; /reset handles the return. */
  async function sendReset() {
    if (!email.trim()) {
      setError('Type your email first, then tap this again.')
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email.trim(),
      { redirectTo: `${window.location.origin}/reset` },
    )

    setBusy(false)

    if (resetError) {
      setError(errorMessage(resetError))
      return
    }

    // Deliberately vague: confirming whether an address has an account here
    // would let anyone check who is registered.
    setNotice(
      `If ${email.trim()} has an account, a reset link is on its way. Check spam too.`,
    )
  }

  async function signInWithGoogle() {
    setBusy(true)
    setError('')
    setNotice('')

    // Supabase handles the round trip; the client is configured with
    // detectSessionInUrl, so the session is picked up when Google sends the
    // browser back here and SessionProvider routes onward from there.
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/`,
        // Always show the account chooser. Without this, a shared laptop
        // silently signs the second person in as the first.
        queryParams: { prompt: 'select_account' },
      },
    })

    if (oauthError) {
      setError(errorMessage(oauthError))
      setBusy(false)
    }
    // On success the page navigates away, so there is no busy state to clear.
  }

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

        <div className="surface mb-4 space-y-4 p-6">
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            disabled={busy}
            className="flex w-full items-center justify-center gap-3 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-rose-950 transition hover:bg-rose-50 disabled:opacity-60"
          >
            <GoogleGlyph />
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <span className="h-px flex-1 bg-rose-800/50" />
            <span className="text-xs text-rose-400">or use an email</span>
            <span className="h-px flex-1 bg-rose-800/50" />
          </div>
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
            <PasswordInput
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

          {mode === 'signin' && (
            <button
              type="button"
              onClick={() => void sendReset()}
              disabled={busy}
              className="w-full text-center text-xs text-rose-400 underline-offset-4 transition-colors hover:text-rose-200 hover:underline"
            >
              Forgot your password?
            </button>
          )}

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
