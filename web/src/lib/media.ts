import { supabase } from './supabase'
import type { MediaType } from './types'

export const BUCKET = 'couple-media'

/** Storage RLS keys off the first path segment, so every upload starts with it. */
export function mediaPath(coupleId: string, folder: string, fileName: string) {
  const safe = fileName.replace(/[^\w.\-]+/g, '_').slice(-60)
  const stamp = Date.now().toString(36)
  return `${coupleId}/${folder}/${stamp}_${safe}`
}

export function mediaTypeOf(file: File): MediaType {
  if (file.type.startsWith('video/')) return 'video'
  if (file.type.startsWith('audio/')) return 'voice'
  return 'photo'
}

export async function uploadMedia(coupleId: string, folder: string, file: File) {
  const path = mediaPath(coupleId, folder, file.name)
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) throw error
  return { path, mediaType: mediaTypeOf(file) }
}

/** The bucket is private, so reads go through short-lived signed URLs. */
export async function signedUrl(path: string, seconds = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds)
  if (error) return null
  return data.signedUrl
}

export async function signedUrls(paths: string[], seconds = 3600) {
  if (paths.length === 0) return {}
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, seconds)
  if (error || !data) return {}
  return Object.fromEntries(
    data.filter((d) => d.signedUrl).map((d) => [d.path as string, d.signedUrl]),
  ) as Record<string, string>
}

export async function removeMedia(paths: string[]) {
  if (paths.length === 0) return
  await supabase.storage.from(BUCKET).remove(paths)
}
