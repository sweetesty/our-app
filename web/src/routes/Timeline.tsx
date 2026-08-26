import { useCallback, useEffect, useRef, useState } from 'react'
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
import { longDate } from '../lib/format'
import { removeMedia, signedUrls, uploadMedia } from '../lib/media'
import VoiceRecorder from '../components/VoiceRecorder'
import ImportantDates from '../components/ImportantDates'
import type { Milestone, MilestoneMedia } from '../lib/types'

const ICONS = ['💫', '💌', '📞', '🌙', '🏡', '✈️', '🥂', '🎂', '💍', '🌊', '🎶', '☕']

export default function Timeline() {
  const { coupleId, refresh } = useSession()
  const [milestones, setMilestones] = useState<Milestone[]>([])
  const [media, setMedia] = useState<Record<string, MilestoneMedia[]>>({})
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState<Milestone | null>(null)
  const [composerOpen, setComposerOpen] = useState(false)

  const load = useCallback(async () => {
    const [{ data: ms, error: msErr }, { data: md }] = await Promise.all([
      supabase.from('milestones').select('*').order('happened_on', { ascending: true }),
      supabase.from('milestone_media').select('*').order('created_at'),
    ])

    if (msErr) {
      setError(errorMessage(msErr))
      setLoading(false)
      return
    }

    setMilestones((ms as Milestone[]) ?? [])

    const grouped: Record<string, MilestoneMedia[]> = {}
    for (const row of (md as MilestoneMedia[]) ?? []) {
      ;(grouped[row.milestone_id] ??= []).push(row)
    }
    setMedia(grouped)

    // One batched signing call rather than one per attachment.
    const paths = ((md as MilestoneMedia[]) ?? []).map((m) => m.storage_path)
    setUrls(await signedUrls(paths))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function remove(milestone: Milestone) {
    const paths = (media[milestone.id] ?? []).map((m) => m.storage_path)
    await supabase.from('milestones').delete().eq('id', milestone.id)
    await removeMedia(paths)
    setEditing(null)
    await load()
  }

  if (loading) return <Loading label="Walking it back…" />

  return (
    <>
      <PageHeader
        eyebrow="How we got here"
        title="Timeline"
        action={<Button onClick={() => setComposerOpen(true)}>Add a moment</Button>}
      >
        The beginning, the first call, the first time you said it. Everything since.
      </PageHeader>

      {error && <div className="mb-4"><ErrorNote>{error}</ErrorNote></div>}

      {/* What's coming, above what already happened — one place for "our
          dates" rather than two things to check. */}
      <ImportantDates />

      <h3 className="mb-3 text-lg font-bold text-white">🗓️ How we got here</h3>

      {milestones.length === 0 ? (
        <EmptyState
          emoji="🗓️"
          title="The story starts somewhere"
          example="the first call that went until 4am"
          action={<Button onClick={() => setComposerOpen(true)}>Add the beginning</Button>}
        >
          Every moment you add draws the thread a little further. Photos, voice
          notes and video all stick to the page.
        </EmptyState>
      ) : (
        <ol className="relative ml-3 space-y-8 border-l-2 border-rose-700/50 pl-6">
          {milestones.map((m, idx) => (
            <li key={m.id} className="animate-rise relative">
              <span
                className={cx(
                  'absolute top-1.5 -left-[31px] size-4 rounded-full border-4 border-rose-950',
                  idx === milestones.length - 1 ? 'bg-pink-500' : 'bg-rose-600',
                )}
              />

              <button onClick={() => setEditing(m)} className="w-full text-left">
                <span className="text-xs font-semibold text-pink-400">
                  {longDate(m.happened_on)}
                </span>
                <h3 className="mt-0.5 text-base font-bold text-white">
                  {m.title} {m.icon}
                </h3>
                {m.description && (
                  <p className="mt-1 text-xs leading-relaxed text-rose-200">{m.description}</p>
                )}
                {m.location && (
                  <p className="mt-1 text-xs text-rose-400">📍 {m.location}</p>
                )}

                {(media[m.id]?.length ?? 0) > 0 && (
                  <div className="mt-4 flex flex-wrap items-end gap-3">
                    {media[m.id].map((item, i) => (
                      <MediaThumb
                        key={item.id}
                        item={item}
                        index={i}
                        url={urls[item.storage_path]}
                      />
                    ))}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ol>
      )}

      <Composer
        open={composerOpen || !!editing}
        milestone={editing}
        onClose={() => {
          setComposerOpen(false)
          setEditing(null)
        }}
        onDelete={editing ? () => void remove(editing) : undefined}
        coupleId={coupleId}
        existingMedia={editing ? (media[editing.id] ?? []) : []}
        mediaUrls={urls}
        onSaved={async () => {
          setComposerOpen(false)
          setEditing(null)
          await load()
          await supabase.rpc('sync_achievements')
          await refresh()
        }}
      />
    </>
  )
}

const PHOTO_TILTS = ['tilt-a', 'tilt-b', 'tilt-c']

function MediaThumb({
  item,
  url,
  index = 0,
}: {
  item: MilestoneMedia
  url?: string
  index?: number
}) {
  if (item.media_type === 'photo') {
    // A real print, not a thumbnail: mount, caption lip, and a slight tilt so
    // a row of them looks stuck into a book rather than laid out on a grid.
    return url ? (
      <figure className={cx('polaroid w-28', PHOTO_TILTS[index % PHOTO_TILTS.length])}>
        <img src={url} alt={item.caption ?? ''} loading="lazy" className="h-24 object-cover" />
        <figcaption className="script absolute right-2 bottom-1.5 left-2 truncate text-center text-sm text-ink-muted">
          {item.caption ?? ''}
        </figcaption>
      </figure>
    ) : (
      <span className="grid size-20 place-items-center rounded-xl bg-sunken text-lg">📷</span>
    )
  }

  if (item.media_type === 'voice') {
    return url ? (
      <audio
        src={url}
        controls
        onClick={(e) => e.stopPropagation()}
        className="h-10 w-56 max-w-full"
      />
    ) : (
      <span className="grid size-20 place-items-center rounded-xl bg-sunken text-lg">🎙️</span>
    )
  }

  return url ? (
    <video
      src={url}
      controls
      onClick={(e) => e.stopPropagation()}
      className="h-32 rounded-xl ring-1 ring-line"
    />
  ) : (
    <span className="grid size-20 place-items-center rounded-xl bg-sunken text-lg">🎬</span>
  )
}

function Composer({
  open,
  milestone,
  onClose,
  onSaved,
  onDelete,
  coupleId,
  existingMedia,
  mediaUrls,
}: {
  open: boolean
  milestone: Milestone | null
  onClose: () => void
  onSaved: () => void
  onDelete?: () => void
  coupleId: string | null
  existingMedia: MilestoneMedia[]
  mediaUrls: Record<string, string>
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [happenedOn, setHappenedOn] = useState('')
  const [icon, setIcon] = useState('💫')
  const [location, setLocation] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setTitle(milestone?.title ?? '')
    setDescription(milestone?.description ?? '')
    setHappenedOn(milestone?.happened_on ?? new Date().toISOString().slice(0, 10))
    setIcon(milestone?.icon ?? '💫')
    setLocation(milestone?.location ?? '')
    setFiles([])
    setError('')
  }, [open, milestone])

  async function save() {
    if (!title.trim() || !happenedOn || !coupleId) return
    setBusy(true)
    setError('')

    try {
      let milestoneId = milestone?.id

      if (milestoneId) {
        const { error: upErr } = await supabase
          .from('milestones')
          .update({ title: title.trim(), description: description.trim() || null, happened_on: happenedOn, icon, location: location.trim() || null })
          .eq('id', milestoneId)
        if (upErr) throw upErr
      } else {
        const { data, error: insErr } = await supabase
          .from('milestones')
          .insert({
            couple_id: coupleId,
            title: title.trim(),
            description: description.trim() || null,
            happened_on: happenedOn,
            icon,
            location: location.trim() || null,
            created_by: (await supabase.auth.getUser()).data.user!.id,
          })
          .select()
          .single()
        if (insErr) throw insErr
        milestoneId = (data as Milestone).id
      }

      for (const file of files) {
        const { path, mediaType } = await uploadMedia(coupleId, 'timeline', file)
        const { error: mediaErr } = await supabase.from('milestone_media').insert({
          milestone_id: milestoneId,
          couple_id: coupleId,
          storage_path: path,
          media_type: mediaType,
        })
        if (mediaErr) throw mediaErr
      }

      onSaved()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function dropMedia(item: MilestoneMedia) {
    await supabase.from('milestone_media').delete().eq('id', item.id)
    await removeMedia([item.storage_path])
    onSaved()
  }

  return (
    <Modal open={open} onClose={onClose} title={milestone ? 'Edit this moment' : 'Add a moment'}>
      <div className="space-y-4">
        <div className="flex gap-3">
          <div className="flex-1">
            <Field label="What happened?">
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="The first call that went until 4am"
                maxLength={90}
              />
            </Field>
          </div>
          <div className="w-32">
            <Field label="When">
              <Input type="date" value={happenedOn} onChange={(e) => setHappenedOn(e.target.value)} />
            </Field>
          </div>
        </div>

        <Field label="Icon">
          <div className="flex flex-wrap gap-1.5">
            {ICONS.map((i) => (
              <button
                key={i}
                onClick={() => setIcon(i)}
                className={
                  icon === i
                    ? 'size-9 rounded-xl bg-lav-400/20 text-lg ring-1 ring-lav-400/40'
                    : 'size-9 rounded-xl bg-raised/50 text-lg opacity-70 hover:opacity-100'
                }
              >
                {i}
              </button>
            ))}
          </div>
        </Field>

        <Field label="Tell it properly">
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="What you remember. What you were wearing. What they said."
            className="min-h-24"
          />
        </Field>

        {/* Free text, not a map pin. A map needs a geocoding key and sends
            every place you have been to a third party. "That rooftop in Lekki"
            is the part worth keeping anyway. */}
        <Field label="Where" hint="Optional.">
          <Input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="That rooftop in Lekki"
            maxLength={80}
          />
        </Field>

        {existingMedia.length > 0 && (
          <Field label="Attached">
            <div className="flex flex-wrap gap-2">
              {existingMedia.map((item, i) => (
                <div key={item.id} className="relative">
                  <MediaThumb item={item} index={i} url={mediaUrls[item.storage_path]} />
                  <button
                    onClick={() => void dropMedia(item)}
                    aria-label="Remove"
                    className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-scrim text-[0.6rem] text-ink-muted ring-1 ring-line hover:text-flame"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </Field>
        )}

        <Field label="Record how you remember it" hint="Optional. Your voice, on the page.">
          <VoiceRecorder
            onRecorded={(voice) =>
              setFiles((current) => {
                // Replace any previous take rather than stacking them up.
                const withoutVoice = current.filter((f) => !f.name.startsWith('voice-note.'))
                return voice ? [...withoutVoice, voice] : withoutVoice
              })
            }
          />
        </Field>

        <Field label="Add photos or video">
          <input
            ref={fileInput}
            type="file"
            multiple
            accept="image/*,audio/*,video/*"
            onChange={(e) =>
              setFiles((current) => [
                ...current.filter((f) => f.name.startsWith('voice-note.')),
                ...Array.from(e.target.files ?? []),
              ])
            }
            className="block w-full text-sm text-ink-muted file:mr-3 file:rounded-full file:border-0 file:bg-raised file:px-4 file:py-2 file:text-sm file:text-ink-soft hover:file:bg-line"
          />
          {files.length > 0 && (
            <p className="mt-2 text-xs text-ink-faint">
              {files.length} file{files.length > 1 ? 's' : ''} ready to upload
            </p>
          )}
        </Field>

        {error && <ErrorNote>{error}</ErrorNote>}

        <div className="flex gap-2">
          <Button className="flex-1" loading={busy} disabled={!title.trim()} onClick={() => void save()}>
            {milestone ? 'Save' : 'Add it'}
          </Button>
          {onDelete && (
            <Button variant="danger" onClick={onDelete}>
              Delete
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
