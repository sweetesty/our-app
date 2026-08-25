import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase, errorMessage } from '../lib/supabase'
import { Button, ErrorNote, Field, PasswordInput } from '../components/ui'
import { LogoLockup } from '../components/Logo'

/**
 * Where the recovery link lands.
 *
 * Supabase puts a recovery token in the URL and the client exchanges it for a
 * short-lived session — which is why this screen can set a password without
 * asking for the old one. That session is only good for this.
 */
export default function ResetPassword() {
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [ready, setReady] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  useEffect(() => {
    // detectSessionInUrl is on, so the token may already be exchanged by the
    // time this mounts. Check for a session either way.
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        setReady(true)
        return
      }

      const { data: sub } = supabase.auth.onAuthStateChange((event) => {
        if (event === 'PASSWORD_RECOVERY' || event === 'SIGNED_IN') setReady(true)
      })

      // If nothing arrives, the link was stale — say so rather than showing a
      // form that cannot work.
      const timer = setTimeout(() => {
        setError('That link has expired. Ask for a new one from the sign-in screen.')
      }, 4000)

      return () => {
        sub.subscription.unsubscribe()
        clearTimeout(timer)
      }
    })
  }, [])

  async function submit(event: FormEvent) {
    event.preventDefault()

    if (password !== confirm) {
      setError("Those two don't match.")
      return
    }

    setBusy(true)
    setError('')

    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (updateError) {
      setError(errorMessage(updateError))
      return
    }

    setDone(true)
    setTimeout(() => navigate('/'), 1500)
  }

  return (
    <div className="grid min-h-dvh place-items-center px-5 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <LogoLockup />
        </div>

        <form
          onSubmit={submit}
          className="space-y-5 rounded-3xl border border-rose-700/40 bg-rose-900/30 p-6 shadow-xl"
        >
          <h1 className="text-lg font-bold text-white">Choose a new password</h1>

          {done ? (
            <p className="text-sm text-emerald-300">
              Done. Taking you back in…
            </p>
          ) : (
            <>
              <Field label="New password" hint="At least 6 characters.">
                <PasswordInput
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </Field>

              <Field label="Again, to be sure">
                <PasswordInput
                  required
                  minLength={6}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
                  placeholder="••••••••"
                />
              </Field>

              {error && <ErrorNote>{error}</ErrorNote>}

              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!ready}>
                {ready ? 'Save new password' : 'Checking your link…'}
              </Button>
            </>
          )}
        </form>
      </div>
    </div>
  )
}
