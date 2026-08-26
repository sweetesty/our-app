import { useEffect, useRef, useState } from 'react'
import { supabase, errorMessage } from '../lib/supabase'
import { useSession } from '../context/SessionProvider'
import { uploadMedia, signedUrl } from '../lib/media'
import { ACCENTS, BACKGROUNDS, applyAppearance } from '../lib/appearance'
import { REACTION_SET } from './Reactions'
import { Avatar, Button, cx, ErrorNote, Field, Input } from './ui'

/** Enough to fill the picker without becoming a keyboard. */
const EMOJI_CHOICES = [
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍',
  '😂', '🤣', '🥹', '🥺', '😍', '🥰', '😘', '😳',
  '🔥', '✨', '💯', '👏', '🙌', '🫶', '💗', '💫',
  '😭', '🤤', '😮', '🙈', '😏', '🫠', '🎉', '🌹',
]

const MAX_REACTIONS = 18

/**
 * Everything that makes it look like yours rather than mine.
 *
 * Colours live on the couple rather than the profile: this is one shared room,
 * and two people seeing different palettes would be two apps. The nickname is
 * the exception — it goes on your row, because a pet name belongs to whoever
 * is using it and they may well call you something else entirely.
 */
export default function Customize() {
  const { summary, userId, refresh } = useSession()
  const couple = summary?.couple

  const [nickname, setNickname] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)
  const [emoji, setEmoji] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setNickname(summary?.me?.partner_nickname ?? '')
    setEmoji(couple?.reactions ?? [...REACTION_SET])
  }, [summary, couple])

  // The stored value is a storage path, not a URL, so it needs signing.
  useEffect(() => {
    const path = couple?.avatar_url
    if (!path) return setAvatarUrl(null)
    void signedUrl(path).then(setAvatarUrl)
  }, [couple?.avatar_url])

  /**
   * Applied immediately, then saved.
   *
   * Waiting for the round trip to repaint made every swatch feel broken on a
   * slow connection — you tap a colour and nothing happens for a second.
   */
  async function choose(field: 'accent' | 'background', value: string) {
    if (!couple) return
    applyAppearance(
      field === 'accent' ? value : couple.accent,
      field === 'background' ? value : couple.background,
    )
    const { error: err } = await supabase
      .from('couples')
      .update({ [field]: value })
      .eq('id', couple.id)
    if (err) return setError(errorMessage(err))
    await refresh()
  }

  async function pickAvatar(file: File) {
    if (!couple) return
    setUploading(true)
    setError('')
    try {
      const uploaded = await uploadMedia(couple.id, 'couple', file)
      const { error: err } = await supabase
        .from('couples')
        .update({ avatar_url: uploaded.path })
        .eq('id', couple.id)
      if (err) throw err
      await refresh()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setUploading(false)
    }
  }

  function toggleEmoji(e: string) {
    setEmoji((current) =>
      current.includes(e)
        ? current.filter((x) => x !== e)
        : current.length >= MAX_REACTIONS
          ? current
          : [...current, e],
    )
  }

  async function save() {
    if (!couple || !userId) return
    setBusy(true)
    setError('')

    const [{ error: pErr }, { error: cErr }] = await Promise.all([
      supabase
        .from('profiles')
        .update({ partner_nickname: nickname.trim() || null })
        .eq('id', userId),
      supabase
        .from('couples')
        // Null means "use the default", so an untouched set is not frozen in
        // place — it keeps following the app if the built-in list changes.
        .update({
          reactions:
            emoji.length > 0 && emoji.join() !== REACTION_SET.join() ? emoji : null,
        })
        .eq('id', couple.id),
    ])

    setBusy(false)
    if (pErr || cErr) return setError(errorMessage(pErr ?? cErr))

    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
    await refresh()
  }

  if (!couple) return null

  const partnerReal = summary?.partner?.real_name ?? summary?.partner?.display_name

  return (
    <section className="surface space-y-6 p-6">
      <h2 className="label">Make it yours</h2>

      {/* --- couple picture ------------------------------------------------ */}
      <div className="flex items-center gap-4">
        <Avatar name={couple.name ?? 'Us'} url={avatarUrl} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-ink-soft">Our picture</p>
          <p className="mt-0.5 text-xs text-ink-faint">
            Shows in the corner instead of the swans.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void pickAvatar(file)
              e.target.value = ''
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="mt-2 text-xs font-semibold text-rose-300 underline-offset-4 hover:underline disabled:opacity-50"
          >
            {uploading ? 'Uploading…' : couple.avatar_url ? 'Change' : 'Choose one'}
          </button>
        </div>
      </div>

      {/* --- nickname ------------------------------------------------------ */}
      <Field
        label="What you call them"
        hint={`Replaces "${partnerReal}" everywhere in the app — for you only. They never see it.`}
      >
        <Input
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder={partnerReal ?? 'Their name'}
          maxLength={30}
        />
      </Field>

      {/* --- accent -------------------------------------------------------- */}
      <div>
        <p className="label mb-2">Colour</p>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ACCENTS.map((a) => (
            <button
              key={a.value}
              onClick={() => void choose('accent', a.value)}
              aria-pressed={couple.accent === a.value}
              className={cx(
                'rounded-2xl border p-2 transition',
                couple.accent === a.value
                  ? 'border-pink-500 bg-rose-900/50'
                  : 'border-rose-800/50 hover:border-rose-600',
              )}
            >
              <span className="flex justify-center gap-0.5">
                {a.swatch.map((c) => (
                  <span
                    key={c}
                    className="size-4 rounded-full ring-1 ring-black/20"
                    style={{ background: c }}
                  />
                ))}
              </span>
              <span className="mt-1.5 block text-[0.6rem] text-ink-muted">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* --- background ---------------------------------------------------- */}
      <div>
        <p className="label mb-2">Background</p>
        <div className="grid grid-cols-2 gap-2">
          {BACKGROUNDS.map((b) => (
            <button
              key={b.value}
              onClick={() => void choose('background', b.value)}
              aria-pressed={couple.background === b.value}
              className={cx(
                'rounded-2xl border px-3 py-2.5 text-left transition',
                couple.background === b.value
                  ? 'border-pink-500 bg-rose-900/50'
                  : 'border-rose-800/50 hover:border-rose-600',
              )}
            >
              <span className="block text-xs font-semibold text-ink-soft">{b.label}</span>
              <span className="mt-0.5 block text-[0.6rem] leading-relaxed text-ink-faint">
                {b.hint}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* --- reactions ----------------------------------------------------- */}
      <div>
        <p className="label mb-1">Your reactions</p>
        <p className="mb-2 text-xs text-ink-faint">
          The first three are the one-tap buttons on a photo. {emoji.length}/{MAX_REACTIONS}.
        </p>
        <div className="grid grid-cols-8 gap-1">
          {EMOJI_CHOICES.map((e) => {
            const on = emoji.includes(e)
            return (
              <button
                key={e}
                onClick={() => toggleEmoji(e)}
                aria-pressed={on}
                className={cx(
                  'rounded-xl py-1.5 text-lg transition',
                  on ? 'bg-pink-600/40 ring-1 ring-pink-500' : 'bg-rose-950/50 opacity-50',
                )}
              >
                {e}
              </button>
            )
          })}
        </div>
        {emoji.length === 0 && (
          <p className="mt-2 text-xs text-rose-400">
            Pick at least one, or the picker has nothing in it.
          </p>
        )}
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <div className="border-t border-rose-800/40 pt-4">
        <Button loading={busy} disabled={emoji.length === 0} onClick={() => void save()}>
          {saved ? 'Saved ✓' : 'Save'}
        </Button>
      </div>
    </section>
  )
}
