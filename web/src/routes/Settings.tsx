import { useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { Avatar, Button, ErrorNote, Field, Input, PageHeader } from '../components/ui'
import PushToggle from '../components/PushToggle'

export default function Settings() {
  const { summary, userId, refresh, signOut } = useSession()
  const [displayName, setDisplayName] = useState('')
  const [spaceName, setSpaceName] = useState('')
  const [anniversary, setAnniversary] = useState('')
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)

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
        </section>

        {error && <ErrorNote>{error}</ErrorNote>}

        <Button loading={busy} onClick={() => void save()}>
          {saved ? 'Saved ✓' : 'Save changes'}
        </Button>

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
            </>
          )}
        </section>

        <section className="surface space-y-3 p-6">
          <h2 className="label">Notifications</h2>
          <p className="text-xs leading-relaxed text-rose-300">
            So a nudge reaches you even when this isn't open.
          </p>
          <PushToggle />
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
      </div>
    </>
  )
}
