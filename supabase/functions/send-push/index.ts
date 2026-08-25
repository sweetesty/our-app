/**
 * send-push — turns a database event into a notification on the other phone.
 *
 * Called by the triggers in migrations/0007_push.sql, never by a client. It is
 * the only place Firebase credentials exist; Postgres just posts it an event.
 *
 * Deploy:
 *   supabase functions deploy send-push --no-verify-jwt
 *   supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat service-account.json)"
 *
 * --no-verify-jwt is deliberate: the caller is Postgres presenting the service
 * role key in the Authorization header, which is checked below, rather than an
 * end-user JWT.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

type PushEvent = {
  type: 'nudge' | 'answer' | 'vault' | 'joined' | 'note' | 'mood' | 'date'
  couple_id: string
  sender_id: string
  sender_name: string
  kind?: string
  message?: string | null
  /** vault only: the label on the outside of the letter. */
  label?: string | null
}

/** Mirrors NUDGES in web/src/lib/types.ts and kNudges in mobile/lib/models.dart. */
const NUDGE_COPY: Record<string, { emoji: string; line: string }> = {
  miss_you: { emoji: '🥺', line: 'misses you' },
  thinking_of_you: { emoji: '❤️', line: 'is thinking of you' },
  need_you: { emoji: '🫂', line: 'needs you' },
  kiss: { emoji: '😘', line: 'wants a kiss' },
  annoying: { emoji: '😂', line: 'is a little annoyed with you' },
  proud: { emoji: '🫶', line: 'is proud of you' },
}

/** Mirrors the mood values in migration 0012. */
const MOOD_COPY: Record<string, { emoji: string; word: string }> = {
  great: { emoji: '🔥', word: 'great' },
  good: { emoji: '😊', word: 'good' },
  loved: { emoji: '🥰', word: 'loved' },
  calm: { emoji: '😌', word: 'calm' },
  meh: { emoji: '😐', word: 'a bit meh' },
  tired: { emoji: '😩', word: 'tired' },
  anxious: { emoji: '😰', word: 'anxious' },
  low: { emoji: '🥺', word: 'low' },
  frustrated: { emoji: '😤', word: 'frustrated' },
  unwell: { emoji: '🤒', word: 'unwell' },
  missing: { emoji: '💭', word: 'like they miss you' },
}

/** Where a tapped notification should land. Set with:
 *  supabase secrets set APP_URL="https://your-site" */
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '')

/** Each notification type belongs on a different screen. */
function pathFor(type: string): string {
  switch (type) {
    case 'vault':
      return '/vault'
    case 'note':
      return '/notes'
    case 'nudge':
      return '/nudges'
    case 'date':
      return '/timeline'
    default:
      return '/' // answer, mood, joined
  }
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
/**
 * The service account JSON is multi-line and its private_key is a PEM full of
 * \n escapes. Passing that through a shell into `supabase secrets set` corrupts
 * it, so the base64 form is preferred — one line, no characters a shell wants
 * to interpret. Raw JSON still works if it survived.
 */
function readServiceAccount(): string {
  const b64 = Deno.env.get('FIREBASE_SERVICE_ACCOUNT_B64')
  if (b64) {
    try {
      return new TextDecoder().decode(
        Uint8Array.from(atob(b64.trim()), (c) => c.charCodeAt(0)),
      )
    } catch (error) {
      console.error('FIREBASE_SERVICE_ACCOUNT_B64 is not valid base64', error)
    }
  }
  return Deno.env.get('FIREBASE_SERVICE_ACCOUNT') ?? ''
}

const SERVICE_ACCOUNT_RAW = readServiceAccount()

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/* -------------------------------------------------------------------------- */
/* Google OAuth — FCM v1 needs an access token minted from the service account */
/* -------------------------------------------------------------------------- */

let cachedToken: { value: string; expiresAt: number } | null = null

function pemToBinary(pem: string): ArrayBuffer {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '')
  const raw = atob(body)
  const bytes = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i)
  return bytes.buffer
}

function base64url(input: string | Uint8Array): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input
  let binary = ''
  for (const b of bytes) binary += String.fromCharCode(b)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function getAccessToken(serviceAccount: {
  client_email: string
  private_key: string
}): Promise<string> {
  // Reuse until a minute before expiry — a cold function may handle a burst.
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.value
  }

  const now = Math.floor(Date.now() / 1000)
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
  const claims = base64url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    }),
  )

  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToBinary(serviceAccount.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  )

  const signature = new Uint8Array(
    await crypto.subtle.sign(
      'RSASSA-PKCS1-v1_5',
      key,
      new TextEncoder().encode(`${header}.${claims}`),
    ),
  )

  const assertion = `${header}.${claims}.${base64url(signature)}`

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    }),
  })

  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${await res.text()}`)
  }

  const json = await res.json()
  cachedToken = {
    value: json.access_token,
    expiresAt: Date.now() + json.expires_in * 1000,
  }
  return cachedToken.value
}

/* -------------------------------------------------------------------------- */
/* copy                                                                        */
/* -------------------------------------------------------------------------- */

function notificationFor(event: PushEvent): { title: string; body: string } {
  if (event.type === 'answer') {
    return {
      title: `${event.sender_name} answered 💌`,
      body: 'Write yours to unlock what they said.',
    }
  }

  if (event.type === 'date') {
    // sender_name carries the icon here — a calendar reminder has no sender.
    if (event.kind === 'today') {
      return {
        title: `${event.sender_name} ${event.label} — today`,
        body: event.message ?? "Don't let it slip past.",
      }
    }
    return {
      title: `${event.sender_name} ${event.label}`,
      body: `Coming up in ${event.message ?? 'a few days'}.`,
    }
  }

  if (event.type === 'note') {
    return {
      title:
        event.kind === 'pinned'
          ? `${event.sender_name} pinned something for you 📌`
          : `${event.sender_name} left you a note 💌`,
      // Title only, never the body — a note is meant to be opened, and
      // spending it on a lock screen would waste the moment.
      body: event.label ?? 'On the wall, whenever you want it.',
    }
  }

  if (event.type === 'mood') {
    const feeling = MOOD_COPY[event.kind ?? ''] ?? { emoji: '💭', word: 'something' }
    return {
      title: `${event.sender_name} is feeling ${feeling.word} ${feeling.emoji}`,
      body: event.message ?? 'Tap to see how their day is going.',
    }
  }

  if (event.type === 'joined') {
    return {
      title: `${event.sender_name} joined 🕯️`,
      body: "You're both in. It's just the two of you now.",
    }
  }

  if (event.type === 'vault') {
    return {
      title: 'Something just unlocked 🎁',
      // The label is the whole point — "Open on your birthday" says more than
      // any wording we could invent around it.
      body: event.label
        ? `${event.label} — ${event.sender_name} left it for you.`
        : `${event.sender_name} left you a letter, and it's ready.`,
    }
  }

  const copy = NUDGE_COPY[event.kind ?? ''] ?? {
    emoji: '❤️',
    line: 'is thinking of you',
  }

  return {
    title: `${event.sender_name} ${copy.line} ${copy.emoji}`,
    body: event.message ?? 'Tap to open Our Little World.',
  }
}

/* -------------------------------------------------------------------------- */

/** First 12 hex of a SHA-256 — enough to compare two secrets without logging
 *  either of them. */
async function fingerprint(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  )
  return Array.from(new Uint8Array(digest))
    .slice(0, 6)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

Deno.serve(async (req) => {
  // Only Postgres should reach this, carrying the service role key.
  const auth = req.headers.get('Authorization') ?? ''
  const presented = auth.replace(/^Bearer\s+/i, '').trim()

  // Accept either the platform-injected service role key or an explicit shared
  // secret. The latter is a fallback for projects where the injected value is
  // not the same string that lives in private.push_config.
  const sharedSecret = Deno.env.get('PUSH_SHARED_SECRET') ?? ''
  const allowed = [SERVICE_ROLE_KEY, sharedSecret].filter(Boolean)

  if (!allowed.includes(presented)) {
    console.error('auth rejected', {
      presented_len: presented.length,
      presented_fp: presented ? await fingerprint(presented) : null,
      env_service_role_len: SERVICE_ROLE_KEY?.length ?? 0,
      env_service_role_fp: SERVICE_ROLE_KEY
        ? await fingerprint(SERVICE_ROLE_KEY)
        : null,
      shared_secret_set: Boolean(sharedSecret),
    })
    return new Response('Forbidden', { status: 403 })
  }

  let event: PushEvent
  try {
    event = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  if (!SERVICE_ACCOUNT_RAW) {
    console.error('FIREBASE_SERVICE_ACCOUNT is not set')
    return Response.json({ sent: 0, reason: 'not configured' })
  }

  let serviceAccount: { client_email: string; private_key: string; project_id: string }
  try {
    serviceAccount = JSON.parse(SERVICE_ACCOUNT_RAW)
  } catch (error) {
    // Say what is wrong with it rather than throwing a bare SyntaxError — the
    // usual cause is shell mangling on the way into `secrets set`.
    console.error('service account is not valid JSON', {
      length: SERVICE_ACCOUNT_RAW.length,
      starts_with: SERVICE_ACCOUNT_RAW.slice(0, 8),
      message: String(error),
    })
    return Response.json(
      { sent: 0, error: 'FIREBASE_SERVICE_ACCOUNT is not valid JSON' },
      { status: 500 },
    )
  }

  if (!serviceAccount.private_key || !serviceAccount.client_email) {
    console.error('service account is missing private_key or client_email')
    return Response.json({ sent: 0, error: 'incomplete service account' }, { status: 500 })
  }

  // Who is this for? Everyone in the couple except whoever caused it.
  const { data: recipients, error: recipientError } = await db
    .from('profiles')
    .select('id')
    .eq('couple_id', event.couple_id)
    .neq('id', event.sender_id)

  if (recipientError) {
    console.error('recipient lookup failed', recipientError)
    return Response.json({ sent: 0, error: recipientError.message }, { status: 500 })
  }

  const recipientIds = (recipients ?? []).map((r) => r.id)
  if (recipientIds.length === 0) {
    return Response.json({ sent: 0, reason: 'no partner yet' })
  }

  const { data: devices } = await db
    .from('device_tokens')
    .select('token, platform')
    .in('user_id', recipientIds)

  if (!devices || devices.length === 0) {
    return Response.json({ sent: 0, reason: 'no registered devices' })
  }

  const accessToken = await getAccessToken(serviceAccount)
  const { title, body } = notificationFor(event)
  const projectId = serviceAccount.project_id

  let sent = 0
  const stale: string[] = []

  await Promise.all(
    devices.map(async (device) => {
      const res = await fetch(
        `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message: {
              token: device.token,
              notification: { title, body },
              // Data travels with it so a tap can open the right screen.
              // The service worker reads `type` on click to pick a screen.
              // (A webpush.fcm_options.link would need an absolute HTTPS URL
              // and would override that handler, so routing stays in one place.)
              data: {
                type: event.type,
                kind: event.kind ?? '',
                couple_id: event.couple_id,
              },
              android: {
                priority: 'high',
                notification: { channel_id: 'nudges', sound: 'default' },
              },
              // FCM displays notification-payload messages itself and its own
              // click handler wins, so a service-worker notificationclick
              // listener never runs. This is the documented way to route the
              // tap, and the URL has to be absolute.
              ...(APP_URL
                ? {
                    webpush: {
                      fcm_options: { link: `${APP_URL}${pathFor(event.type)}` },
                      notification: {
                        icon: `${APP_URL}/pwa-192x192.png`,
                        badge: `${APP_URL}/pwa-192x192.png`,
                      },
                    },
                  }
                : {}),
              apns: {
                headers: { 'apns-priority': '10' },
                payload: { aps: { sound: 'default', badge: 1 } },
              },
            },
          }),
        },
      )

      if (res.ok) {
        sent++
        return
      }

      const text = await res.text()
      // A token dies when the app is uninstalled or reinstalled. Reap it, or
      // this function retries a dead address on every nudge forever.
      if (res.status === 404 || text.includes('UNREGISTERED') || text.includes('INVALID_ARGUMENT')) {
        stale.push(device.token)
      } else {
        console.error('fcm send failed', res.status, text)
      }
    }),
  )

  if (stale.length > 0) {
    await db.from('device_tokens').delete().in('token', stale)
  }

  return Response.json({ sent, pruned: stale.length })
})
