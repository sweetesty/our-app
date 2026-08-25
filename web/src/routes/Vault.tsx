import { useCallback, useEffect, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import {
  Button,
  cx,
  EmptyState,
  ErrorNote,
  Field,
  Input,
  Loading,
  Modal,
  PageHeader,
  Textarea,
} from '../components/ui'
import { untilUnlock, when } from '../lib/format'
import { signedUrl, uploadMedia } from '../lib/media'
import type { VaultContents, VaultItem } from '../lib/types'

const CONDITION_PRESETS = [
  'when you miss me',
  'when you need to hear something good',
  "when we've argued",
  "when you can't sleep",
  'when you forget why you chose me',
]

export default function Vault() {
  const { userId, coupleId, summary, refresh } = useSession()
  const [items, setItems] = useState<VaultItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [composerOpen, setComposerOpen] = useState(false)
  const [reading, setReading] = useState<VaultItem | null>(null)

  const load = useCallback(async () => {
    const { data, error: qErr } = await supabase
      .from('vault_items')
      .select('*')
      .order('created_at', { ascending: false })
    if (qErr) setError(errorMessage(qErr))
    else setItems((data as VaultItem[]) ?? [])
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const forMe = items.filter((i) => i.recipient_id === userId)
  const fromMe = items.filter((i) => i.author_id === userId && i.recipient_id !== userId)
  const partnerName = summary?.partner?.display_name ?? 'them'

  if (loading) return <Loading label="Checking the vault…" />

  return (
    <>
      <PageHeader
        eyebrow="Sealed"
        title="The vault"
        action={<Button onClick={() => setComposerOpen(true)}>Seal something</Button>}
      >
        Letters that open later — on a date, or the moment they need it.
      </PageHeader>

      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      {items.length === 0 ? (
        <EmptyState
          emoji="🔒"
          title="Nothing sealed yet"
          example="open this when you miss me"
          action={<Button onClick={() => setComposerOpen(true)}>Write the first letter</Button>}
        >
          Write something now that they can only read later — on a date you pick,
          or the moment they need it. Locked until then, properly.
        </EmptyState>
      ) : (
        <div className="space-y-8">
          {forMe.length > 0 && (
            <section className="space-y-3">
              <h2 className="label">Waiting for you</h2>
              <div className="grid grid-cols-1 gap-3">
                {forMe.map((item) => (
                  <VaultCard key={item.id} item={item} mine={false} onOpen={() => setReading(item)} />
                ))}
              </div>
            </section>
          )}

          {fromMe.length > 0 && (
            <section className="space-y-3">
              <h2 className="label">You left these for {partnerName}</h2>
              <div className="grid grid-cols-1 gap-3">
                {fromMe.map((item) => (
                  <VaultCard key={item.id} item={item} mine onOpen={() => setReading(item)} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      <Composer
        open={composerOpen}
        onClose={() => setComposerOpen(false)}
        coupleId={coupleId}
        userId={userId}
        partnerId={summary?.partner?.id ?? null}
        partnerName={partnerName}
        onSaved={async () => {
          setComposerOpen(false)
          await load()
          await supabase.rpc('sync_achievements')
          await refresh()
        }}
      />

      <Reader
        item={reading}
        mine={reading?.author_id === userId}
        onClose={() => setReading(null)}
        onChanged={load}
      />
    </>
  )
}

function isReady(item: VaultItem) {
  if (item.unlocked_at) return true
  if (item.unlock_type === 'condition') return true // theirs to open whenever it applies
  return !!item.unlock_at && new Date(item.unlock_at).getTime() <= Date.now()
}

function VaultCard({
  item,
  mine,
  onOpen,
}: {
  item: VaultItem
  mine: boolean
  onOpen: () => void
}) {
  const ready = isReady(item)
  const opened = !!item.unlocked_at
  const openable = ready && !mine && !opened

  return (
    <button
      onClick={onOpen}
      className="animate-rise flex w-full items-center justify-between gap-3 rounded-2xl border border-rose-700/40 bg-rose-900/30 p-4 text-left transition hover:border-pink-500/40"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="text-2xl">{opened ? '💌' : openable ? '💌' : '🔒'}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-bold text-white">{item.label}</span>
          <span
            className={cx(
              'block text-xs',
              openable ? 'text-pink-300' : 'text-rose-300',
            )}
          >
            {item.unlock_type === 'condition'
              ? `Open ${item.unlock_condition}`
              : opened
                ? `Opened ${when(item.unlocked_at)}`
                : openable
                  ? 'Ready to unlock!'
                  : `Locked · ${untilUnlock(item.unlock_at)}`}
          </span>
        </span>
      </span>

      <span
        className={cx(
          'shrink-0 rounded-xl px-3 py-1.5 text-xs font-semibold',
          openable
            ? 'bg-pink-600 text-white shadow'
            : 'border border-rose-700/50 bg-rose-800/50 text-rose-200',
        )}
      >
        {opened ? 'Read' : openable ? 'Open ✨' : mine ? 'Sealed' : 'Locked'}
      </span>
    </button>
  )
}

function Reader({
  item,
  mine,
  onClose,
  onChanged,
}: {
  item: VaultItem | null
  mine: boolean
  onClose: () => void
  onChanged: () => Promise<void>
}) {
  const [contents, setContents] = useState<VaultContents | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [opening, setOpening] = useState(false)
  const [emailing, setEmailing] = useState(false)
  const [emailed, setEmailed] = useState(false)

  async function emailCopy() {
    if (!item) return
    setEmailing(true)
    setError('')
    // The RPC refuses if the letter is still sealed, so this can never become
    // a way to read one early via your inbox.
    const { error: rpcError } = await supabase.rpc('email_vault_item', { item: item.id })
    setEmailing(false)
    if (rpcError) setError(errorMessage(rpcError))
    else setEmailed(true)
  }

  const fetchContents = useCallback(async (itemId: string) => {
    // RLS returns nothing here unless you wrote it, or it is genuinely unlocked.
    const { data } = await supabase
      .from('vault_contents')
      .select('*')
      .eq('item_id', itemId)
      .maybeSingle()

    setContents((data as VaultContents) ?? null)
    const path = (data as VaultContents | null)?.media_path
    setUrl(path ? await signedUrl(path) : null)
  }, [])

  useEffect(() => {
    setContents(null)
    setUrl(null)
    setError('')
    setOpening(false)
    if (!item) return
    if (mine || item.unlocked_at) void fetchContents(item.id)
  }, [item, mine, fetchContents])

  async function unlock() {
    if (!item) return
    setBusy(true)
    setError('')
    const { error: rpcError } = await supabase.rpc('unlock_vault_item', { item: item.id })
    if (rpcError) {
      setError(errorMessage(rpcError))
      setBusy(false)
      return
    }
    setOpening(true)
    await fetchContents(item.id)
    await onChanged()
    setBusy(false)
  }

  async function destroy() {
    if (!item) return
    await supabase.from('vault_items').delete().eq('id', item.id)
    await onChanged()
    onClose()
  }

  if (!item) return null

  const ready = isReady(item)
  const showContents = mine || !!item.unlocked_at || opening

  return (
    <Modal open onClose={onClose} title={item.label}>
      <div className="space-y-5">
        {showContents ? (
          <div className={opening ? 'animate-unseal space-y-4' : 'space-y-4'}>
            {contents?.body && (
              <p className="font-display text-lg leading-relaxed whitespace-pre-wrap text-ink">
                {contents.body}
              </p>
            )}

            {url && contents?.media_type === 'photo' && (
              <img src={url} alt="" className="w-full rounded-2xl ring-1 ring-line" />
            )}
            {url && contents?.media_type === 'voice' && <audio src={url} controls className="w-full" />}
            {url && contents?.media_type === 'video' && (
              <video src={url} controls className="w-full rounded-2xl ring-1 ring-line" />
            )}

            {!contents?.body && !url && (
              <p className="text-sm text-ink-faint">This one was left empty.</p>
            )}

            <p className="text-xs text-ink-faint">
              {mine
                ? item.unlocked_at
                  ? `They opened this ${when(item.unlocked_at)}.`
                  : ready
                    ? 'Waiting for them to open it.'
                    : `Opens ${untilUnlock(item.unlock_at)}.`
                : `Sealed ${when(item.created_at)}.`}
            </p>
          </div>
        ) : ready ? (
          <div className="space-y-4 py-4 text-center">
            <p className="animate-pulse-soft text-5xl">✨</p>
            <p className="text-sm leading-relaxed text-ink-muted">
              {item.unlock_type === 'condition'
                ? `They left this for you — open it ${item.unlock_condition}.`
                : 'This one is ready.'}
            </p>
            {error && <ErrorNote>{error}</ErrorNote>}
            <Button size="lg" loading={busy} className="w-full" onClick={() => void unlock()}>
              Break the seal
            </Button>
          </div>
        ) : (
          <div className="space-y-3 py-6 text-center">
            <p className="text-5xl">🔒</p>
            <p className="text-sm text-ink-muted">{untilUnlock(item.unlock_at)}</p>
            <p className="text-xs leading-relaxed text-ink-faint">
              Not even the app can show you this one early — the words are behind a
              database rule, not a locked button.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-2">
          {showContents && (
            <Button variant="ghost" size="sm" loading={emailing} onClick={() => void emailCopy()}>
              {emailed ? 'Sent to your inbox ✓' : '📧 Email me a copy'}
            </Button>
          )}
          {mine && (
            <Button variant="danger" size="sm" onClick={() => void destroy()}>
              Delete this letter
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Composer({
  open,
  onClose,
  onSaved,
  coupleId,
  userId,
  partnerId,
  partnerName,
}: {
  open: boolean
  onClose: () => void
  onSaved: () => void
  coupleId: string | null
  userId: string | null
  partnerId: string | null
  partnerName: string
}) {
  const [label, setLabel] = useState('')
  const [body, setBody] = useState('')
  const [mode, setMode] = useState<'date' | 'condition'>('date')
  const [unlockAt, setUnlockAt] = useState('')
  const [condition, setCondition] = useState(CONDITION_PRESETS[0])
  const [file, setFile] = useState<File | null>(null)
  const [emailIt, setEmailIt] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setLabel('')
    setBody('')
    setFile(null)
    setEmailIt(false)
    setError('')
    const soon = new Date()
    soon.setMonth(soon.getMonth() + 1)
    setUnlockAt(soon.toISOString().slice(0, 10))
  }, [open])

  async function save() {
    if (!label.trim() || !coupleId || !userId || !partnerId) return
    if (mode === 'date' && !unlockAt) return
    setBusy(true)
    setError('')

    try {
      const { data, error: insErr } = await supabase
        .from('vault_items')
        .insert({
          couple_id: coupleId,
          author_id: userId,
          recipient_id: partnerId,
          label: label.trim(),
          unlock_type: mode,
          unlock_at: mode === 'date' ? new Date(`${unlockAt}T00:00:00`).toISOString() : null,
          unlock_condition: mode === 'condition' ? condition : null,
          // Only meaningful for date-locked letters — a condition-locked one
          // opens whenever they choose, so there is no moment to email on.
          email_on_unlock: mode === 'date' ? emailIt : false,
        })
        .select()
        .single()
      if (insErr) throw insErr

      const item = data as VaultItem
      let mediaPath: string | null = null
      let mediaType: string | null = null

      if (file) {
        const uploaded = await uploadMedia(coupleId, 'vault', file)
        mediaPath = uploaded.path
        mediaType = uploaded.mediaType
      }

      const { error: contentErr } = await supabase.from('vault_contents').insert({
        item_id: item.id,
        body: body.trim() || null,
        media_path: mediaPath,
        media_type: mediaType,
      })
      if (contentErr) throw contentErr

      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  if (!partnerId) {
    return (
      <Modal open={open} onClose={onClose} title="Seal something">
        <p className="text-sm text-ink-muted">
          Once {partnerName} joins your space you can start leaving letters for them.
        </p>
      </Modal>
    )
  }

  return (
    <Modal open={open} onClose={onClose} title={`Seal something for ${partnerName}`}>
      <div className="space-y-4">
        <Field label="What they'll see on the outside">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Open on your birthday"
            maxLength={70}
          />
        </Field>

        <Field label="When does it open?">
          <div className="mb-3 flex gap-2">
            {(['date', 'condition'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={
                  mode === m
                    ? 'flex-1 rounded-full bg-lav-400/15 py-2 text-sm text-lav-300 ring-1 ring-lav-400/30'
                    : 'flex-1 rounded-full bg-raised/50 py-2 text-sm text-ink-muted hover:text-ink-soft'
                }
              >
                {m === 'date' ? 'On a date' : 'When they need it'}
              </button>
            ))}
          </div>

          {mode === 'date' ? (
            <Input
              type="date"
              value={unlockAt}
              min={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setUnlockAt(e.target.value)}
            />
          ) : (
            <div className="flex flex-wrap gap-2">
              {CONDITION_PRESETS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCondition(c)}
                  className={
                    condition === c
                      ? 'rounded-full bg-lav-400/15 px-3 py-1.5 text-xs text-lav-300 ring-1 ring-lav-400/30'
                      : 'rounded-full bg-raised/50 px-3 py-1.5 text-xs text-ink-muted hover:text-ink-soft'
                  }
                >
                  {c}
                </button>
              ))}
            </div>
          )}
        </Field>

        <Field label="The letter">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write it like they're reading it on the day, not today…"
          />
        </Field>

        <Field label="Attach something" hint="A photo, a voice note, a video. Optional.">
          <input
            type="file"
            accept="image/*,audio/*,video/*"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-full file:border-0 file:bg-raised file:px-4 file:py-2 file:text-sm file:text-ink-soft hover:file:bg-line"
          />
        </Field>

        {mode === 'date' && (
          <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-rose-700/40 bg-rose-900/20 p-4">
            <input
              type="checkbox"
              checked={emailIt}
              onChange={(e) => setEmailIt(e.target.checked)}
              className="mt-0.5 size-4 accent-pink-500"
            />
            <span className="text-xs leading-relaxed text-rose-300">
              <span className="font-semibold text-white">
                Also email it to them when it opens
              </span>
              <br />
              So it lands even if they don't open the app that day. Note that an
              email leaves this app — it sits in their inbox, where it isn't
              protected the way it is here.
            </span>
          </label>
        )}

        {error && <ErrorNote>{error}</ErrorNote>}
        <Button className="w-full" loading={busy} disabled={!label.trim()} onClick={() => void save()}>
          Seal it
        </Button>
      </div>
    </Modal>
  )
}
