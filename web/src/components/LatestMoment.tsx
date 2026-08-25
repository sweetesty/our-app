import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { signedUrl } from '../lib/media'
import { ago } from '../lib/format'
import Reactions, { type ReactionRow } from './Reactions'

type Latest = {
  id: string
  storage_path: string
  media_type: string
  caption: string | null
  author_name: string | null
  mine: boolean
  created_at: string
  reactions: ReactionRow[]
}

/**
 * Their face, first thing.
 *
 * The Moments tab holds the history; this is the bit that makes opening the app
 * feel like looking at them. Sits at the top of Today, above everything else.
 */
export default function LatestMoment() {
  const [moment, setMoment] = useState<Latest | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('latest_moment')

    // The table may not exist yet if 0017 has not been run — stay quiet rather
    // than breaking the whole Today screen over it.
    if (error || !data) {
      setMoment(null)
      setLoading(false)
      return
    }

    const row = data as Latest
    setMoment(row)
    setUrl(await signedUrl(row.storage_path))
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  if (loading || !moment) return null

  return (
    <div className="overflow-hidden rounded-3xl border border-pink-500/30 bg-rose-900/30 shadow-xl">
      <Link to="/moments" className="block">
        {url ? (
          <img
            src={url}
            alt={moment.caption ?? ''}
            className="aspect-square w-full object-cover"
          />
        ) : (
          <div className="grid aspect-square w-full place-items-center bg-rose-950/60 text-4xl">
            📸
          </div>
        )}
      </Link>

      <div className="space-y-2 p-4">
        {moment.caption && <p className="text-sm text-rose-100">{moment.caption}</p>}

        <p className="text-xs text-rose-400">
          {moment.mine ? 'You' : (moment.author_name ?? 'They')} · {ago(moment.created_at)}
        </p>

        <Reactions
          targetKind="moment"
          targetId={moment.id}
          reactions={moment.reactions ?? []}
          onChanged={load}
        />
      </div>
    </div>
  )
}
