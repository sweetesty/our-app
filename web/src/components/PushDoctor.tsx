import { useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { Button, cx } from './ui'

type Diagnosis = {
  configured: boolean
  my_devices: number
  their_devices: number
  recent: { status_code: number | null; reply: string; created: string }[] | null
}

/**
 * Where a notification stopped.
 *
 * A push crosses four things that each fail quietly — the config row, the HTTP
 * call out of Postgres, the Edge Function, and Firebase — and dispatch_push
 * swallows every error on purpose, because a failed notification must never
 * roll back the message that caused it. That is the right trade and it leaves
 * you with no way to tell why your phone is silent.
 *
 * This asks the database the four questions directly, and sends one push to
 * this phone only.
 */
export default function PushDoctor() {
  const [open, setOpen] = useState(false)
  const [result, setResult] = useState<Diagnosis | null>(null)
  const [busy, setBusy] = useState(false)
  const [tested, setTested] = useState(false)
  const [error, setError] = useState('')

  async function check() {
    setBusy(true)
    setError('')
    const { data, error: rpcError } = await supabase.rpc('push_diagnostics')
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    setResult(data as Diagnosis)
    setOpen(true)
  }

  async function test() {
    setBusy(true)
    setError('')
    setTested(false)
    const { error: rpcError } = await supabase.rpc('send_test_push')
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))
    setTested(true)
    // Give pg_net a moment to record the reply before reading the log back.
    window.setTimeout(() => void check(), 2500)
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" loading={busy} onClick={() => void test()}>
          {tested ? 'Sent — watch for it ✓' : 'Send this phone a test'}
        </Button>
        <Button variant="quiet" size="sm" onClick={() => void check()}>
          Why aren't they landing?
        </Button>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}

      {open && result && (
        <div className="space-y-2 rounded-2xl border border-rose-700/40 bg-rose-950/50 p-4">
          <Line
            ok={result.configured}
            good="The database knows where to send them."
            bad="Push isn't wired up: private.push_config is missing or disabled."
          />
          <Line
            ok={result.my_devices > 0}
            good={`This account has ${result.my_devices} phone${result.my_devices === 1 ? '' : 's'} registered.`}
            bad="No phone registered for you — turn notifications on above."
          />
          <Line
            ok={result.their_devices > 0}
            good={`They have ${result.their_devices} phone${result.their_devices === 1 ? '' : 's'} registered.`}
            bad="They have no phone registered, so nothing you do can reach them. They need to turn notifications on, on their own device."
          />

          {result.recent === null ? (
            <p className="text-xs text-rose-400">
              Couldn't read the send log on this project.
            </p>
          ) : result.recent.length === 0 ? (
            <p className="text-xs text-rose-400">
              Nothing sent recently. Either nothing triggered one, or the call
              never left the database.
            </p>
          ) : (
            <div className="space-y-1 pt-1">
              <p className="label">Last few attempts</p>
              {result.recent.map((r, i) => (
                <p
                  key={i}
                  className={cx(
                    'truncate font-mono text-[0.65rem]',
                    r.status_code === 200 ? 'text-emerald-300' : 'text-rose-400',
                  )}
                  title={r.reply}
                >
                  {r.status_code ?? '—'} · {r.reply || 'no reply'}
                </p>
              ))}
              <p className="pt-1 text-[0.65rem] leading-relaxed text-rose-400">
                <span className="text-rose-300">{'{"sent":1}'}</span> means it
                reached Firebase.{' '}
                <span className="text-rose-300">no registered devices</span>{' '}
                means their phone was never registered.{' '}
                <span className="text-rose-300">403</span> means the function is
                rejecting the database's key.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Line({ ok, good, bad }: { ok: boolean; good: string; bad: string }) {
  return (
    <p className={cx('flex gap-2 text-xs leading-relaxed', ok ? 'text-emerald-300' : 'text-rose-300')}>
      <span aria-hidden>{ok ? '✓' : '✕'}</span>
      <span>{ok ? good : bad}</span>
    </p>
  )
}
