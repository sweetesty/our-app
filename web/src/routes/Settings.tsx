import { useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { Avatar, Button, ErrorNote, Field, Input, PageHeader } from '../components/ui'
import PushToggle from '../components/PushToggle'
import PushDoctor from '../components/PushDoctor'
import Customize from '../components/Customize'

export default function Settings() {
  const { summary, userId, refresh, signOut } = useSession()
  const [displayName, setDisplayName] = useState('')
  const [spaceName, setSpaceName] = useState('')
  const [anniversary, setAnniversary] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const [leaveError, setLeaveError] = useState('')

  /** Undo a solo space so you can join your partner's instead. The RPC refuses
   *  once they have joined, so this can never orphan a shared space. */
  async function leave() {
    setLeaving(true)
    setLeaveError('')
    const { error: rpcError } = await supabase.rpc('leave_couple')
    setLeaving(false)
    if (rpcError) return setLeaveError(errorMessage(rpcError))
    await refresh()
  }

  useEffect(() => {
    setDisplayName(summary?.me?.display_name ?? '')
    setSpaceName(summary?.couple?.name ?? '')
    setAnniversary(summary?.couple?.anniversary ?? '')
  }, [summary])

  async function save() {
    if (!userId || !summary?.couple) return
    setBusy(true)
    setError('')

    const [{ error: profileErr }, { error: coupleErr }] = await Promise.all([
      supabase.from('profiles').update({ display_name: displayName.trim() || 'You' }).eq('id', userId),
      supabase
        .from('couples')
        .update({ name: spaceName.trim() || null, anniversary: anniversary || null })
        .eq('id', summary.couple.id),
    ])

    setBusy(false)
    if (profileErr || coupleErr) return setError(errorMessage(profileErr ?? coupleErr))

    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
    await refresh()
  }

  async function copyCode() {
    if (!summary?.couple) return
    await navigator.clipboard.writeText(summary.couple.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const partner = summary?.partner

  return (
    <>
      <PageHeader eyebrow="Settings" title="Your space" />

      <div className="space-y-4">
        <section className="surface space-y-4 p-6">
          <h2 className="label">You</h2>
          <div className="flex items-center gap-4">
            <Avatar name={summary?.me?.display_name} url={summary?.me?.avatar_url} size="lg" />
            <div className="flex-1">
              <Field label="Display name">
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  maxLength={40}
                />
              </Field>
            </div>
          </div>
        </section>

        <section className="surface space-y-4 p-6">
          <h2 className="label">The space</h2>
          <Field label="Name" hint="Shows in the corner. “Us” works fine.">
            <Input value={spaceName} onChange={(e) => setSpaceName(e.target.value)} maxLength={40} />
          </Field>
          <Field label="Together since" hint="Powers the day count and the timeline.">
            <Input
              type="date"
              value={anniversary}
              onChange={(e) => setAnniversary(e.target.value)}
            />
          </Field>

          {/* Kept inside the card rather than floating between sections: on a
              phone it scrolled away from the fields it saves and read like a
              button belonging to nothing. */}
          {error && <ErrorNote>{error}</ErrorNote>}

          <div className="border-t border-rose-800/40 pt-4">
            <Button loading={busy} onClick={() => void save()}>
              {saved ? 'Saved ✓' : 'Save changes'}
            </Button>
          </div>
        </section>

        <Customize />

        <section className="surface space-y-3 p-6">
          <h2 className="label">Who's here</h2>
          {partner ? (
            <div className="flex items-center gap-3">
              <Avatar name={partner.display_name} url={partner.avatar_url} />
              <div>
                <p className="text-sm text-ink-soft">{partner.display_name}</p>
                <p className="text-xs text-ink-faint">joined — the space is full</p>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-ink-muted">
                Send them this code. Once they use it, the door closes — nobody else can
                join.
              </p>
              <button
                onClick={() => void copyCode()}
                className="w-full rounded-2xl border border-lav-500/40 bg-canvas/60 py-5 transition-colors hover:bg-canvas"
              >
                <span className="font-display text-3xl tracking-[0.3em] text-lav-300">
                  {summary?.couple?.invite_code}
                </span>
                <span className="mt-1.5 block text-xs text-ink-faint">
                  {copied ? 'copied ✓' : 'tap to copy'}
                </span>
              </button>

              {/* Only reachable while you are alone in here. Once someone has
                  joined, leave_couple() refuses and this disappears — you
                  cannot walk out of a shared space by accident. */}
              <div className="border-t border-rose-800/50 pt-4">
                <p className="mb-2 text-xs leading-relaxed text-rose-300">
                  Made this by mistake, and actually have <em>their</em> code?
                </p>
                {leaveError && <ErrorNote>{leaveError}</ErrorNote>}
                <Button variant="ghost" size="sm" loading={leaving} onClick={() => void leave()}>
                  Leave and join theirs instead
                </Button>
              </div>
            </>
          )}
        </section>

        <section className="surface space-y-3 p-6">
          <h2 className="label">Notifications</h2>
          <p className="text-xs leading-relaxed text-rose-300">
            So a nudge reaches you even when this isn't open.
          </p>
          <PushToggle />
          <PushDoctor />
        </section>

        <section className="surface space-y-3 p-6">
          <h2 className="label">Privacy</h2>
          <ul className="space-y-2 text-sm leading-relaxed text-ink-muted">
            <li>· Two accounts. No third person can join, enforced by the database.</li>
            <li>· No profiles, no followers, no feed, no discovery, no algorithm.</li>
            <li>· Every row is scoped to your space by row-level security.</li>
            <li>· Photos and voice notes sit in a private bucket behind signed URLs.</li>
            <li>· Sealed letters stay unreadable until they open — that rule is in Postgres, not the UI.</li>
          </ul>
        </section>

        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out
        </Button>

        <DangerZone partnerName={partner?.display_name ?? 'them'} onDone={refresh} />
      </div>
    </>
  )
}

/* -------------------------------------------------------------------------- */

const DOORS = [
  {
    rpc: 'wipe_couple_data',
    emoji: '🧹',
    title: 'Empty the space',
    blurb:
      'Deletes every note, photo, card, letter and message — and the files behind them. Both accounts and the space itself stay, so you can start again from nothing.',
  },
  {
    rpc: 'delete_couple',
    emoji: '💔',
    title: 'Delete our space',
    blurb:
      'Everything above, and the space goes too. You both keep your logins and can pair again — with each other or not. They are not asked first.',
  },
  {
    rpc: 'delete_my_account',
    emoji: '🚪',
    title: 'Delete my account',
    blurb:
      'Everything above, plus your login. This takes the shared space with it: half a two-person space is not a thing worth leaving behind, and pretending otherwise would quietly delete your half of their memories anyway.',
  },
] as const

/**
 * A way out.
 *
 * Until now the only exit was asking someone to run SQL against the database.
 * Every door needs the word DELETE typed: a confirm dialog can be tapped
 * through by accident, and none of this can be undone.
 */
function DangerZone({ partnerName, onDone }: { partnerName: string; onDone: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const [chosen, setChosen] = useState<(typeof DOORS)[number] | null>(null)
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function run() {
    if (!chosen || confirm !== 'DELETE') return
    setBusy(true)
    setError('')

    const { error: rpcError } = await supabase.rpc(chosen.rpc, { confirm })
    setBusy(false)
    if (rpcError) return setError(errorMessage(rpcError))

    // Deleting the account already ended the session server-side; signing out
    // clears the local one so the app does not sit on a dead token.
    if (chosen.rpc === 'delete_my_account') {
      await supabase.auth.signOut()
      window.location.href = '/'
      return
    }

    setChosen(null)
    setConfirm('')
    await onDone()
  }

  return (
    <section className="rounded-3xl border border-rose-800/50 p-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between text-left"
      >
        <h2 className="label">Leaving</h2>
        <span className="text-xs text-rose-400">{open ? 'Hide' : 'Show'}</span>
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs leading-relaxed text-rose-400">
            None of this can be undone, and {partnerName} is not warned first.
          </p>

          {DOORS.map((door) => (
            <div key={door.rpc} className="rounded-2xl border border-rose-800/50 bg-rose-950/40 p-4">
              <p className="text-sm font-semibold text-white">
                {door.emoji} {door.title}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-rose-400">{door.blurb}</p>

              {chosen?.rpc === door.rpc ? (
                <div className="mt-3 space-y-2">
                  <Input
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Type DELETE"
                    autoFocus
                  />
                  {error && <ErrorNote>{error}</ErrorNote>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setChosen(null)
                        setConfirm('')
                        setError('')
                      }}
                      className="rounded-xl bg-rose-900/60 px-4 py-2 text-xs font-semibold text-rose-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void run()}
                      disabled={busy || confirm !== 'DELETE'}
                      className="flex-1 rounded-xl bg-red-700 py-2 text-xs font-semibold text-white transition disabled:opacity-40"
                    >
                      {busy ? 'Working…' : `Yes — ${door.title.toLowerCase()}`}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => {
                    setChosen(door)
                    setConfirm('')
                    setError('')
                  }}
                  className="mt-3 text-xs font-semibold text-red-400 underline-offset-4 hover:underline"
                >
                  {door.title}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
