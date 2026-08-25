/**
 * send-letter — delivers a vault letter by email.
 *
 * Called by the unlock job in 0010_letter_email.sql, or by a person tapping
 * "email me a copy" on an already-open letter. Never by an anonymous client.
 *
 * Sends over plain SMTP, so any mailbox works and there is no email service to
 * sign up for. With Gmail you need an App Password (Google account → Security →
 * 2-Step Verification → App passwords); your normal password will be rejected.
 *
 * Deploy:
 *   supabase functions deploy send-letter --no-verify-jwt
 *   supabase secrets set SMTP_HOST="smtp.gmail.com"
 *   supabase secrets set SMTP_PORT="465"
 *   supabase secrets set SMTP_USER="you@gmail.com"
 *   supabase secrets set SMTP_PASS="your-16-char-app-password"
 *   supabase secrets set LETTER_FROM="Our Little World <you@gmail.com>"
 *   supabase secrets set APP_URL="https://your-app.vercel.app"
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts'

type LetterEvent = {
  item_id: string
  reason: 'unlocked' | 'requested'
  /** requested only: who asked for it. */
  to_user_id?: string
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const SHARED_SECRET = Deno.env.get('PUSH_SHARED_SECRET') ?? ''
const SMTP_HOST = Deno.env.get('SMTP_HOST') ?? ''
const SMTP_PORT = Number(Deno.env.get('SMTP_PORT') ?? '465')
const SMTP_USER = Deno.env.get('SMTP_USER') ?? ''
const SMTP_PASS = Deno.env.get('SMTP_PASS') ?? ''
const FROM = Deno.env.get('LETTER_FROM') || SMTP_USER
const APP_URL = Deno.env.get('APP_URL') ?? ''

function smtpConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS)
}

async function sendMail(to: string, subject: string, html: string): Promise<void> {
  const client = new SMTPClient({
    connection: {
      hostname: SMTP_HOST,
      port: SMTP_PORT,
      // 465 is implicit TLS; 587 upgrades via STARTTLS.
      tls: SMTP_PORT === 465,
      auth: { username: SMTP_USER, password: SMTP_PASS },
    },
  })

  try {
    await client.send({ from: FROM, to, subject, html })
  } finally {
    // Leaving the connection open would keep the isolate alive past the reply.
    await client.close()
  }
}

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

/** Letters are written by hand and rendered into HTML, so escape everything. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function renderEmail(opts: {
  label: string
  body: string | null
  authorName: string
  hasAttachment: boolean
}): string {
  const paragraphs = (opts.body ?? '')
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 18px;line-height:1.7;">${escapeHtml(p).replace(/\n/g, '<br>')}</p>`)
    .join('')

  return `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#4c0519;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="font-size:32px;">💌</div>
        <div style="color:#fda4af;font-size:12px;letter-spacing:2px;text-transform:uppercase;margin-top:8px;">
          Our Little World
        </div>
      </div>

      <div style="background:#881337;border:1px solid #9f1239;border-radius:20px;padding:28px;">
        <div style="color:#f9a8d4;font-size:13px;font-weight:600;margin-bottom:6px;">
          ${escapeHtml(opts.label)}
        </div>
        <div style="color:#fda4af;font-size:12px;margin-bottom:22px;">
          ${escapeHtml(opts.authorName)} wrote this for you.
        </div>

        <div style="color:#fff1f2;font-size:16px;">
          ${paragraphs || '<p style="color:#fda4af;">This one was left empty.</p>'}
        </div>

        ${
          opts.hasAttachment
            ? `<div style="margin-top:22px;padding:14px;background:#4c0519;border-radius:12px;color:#fda4af;font-size:13px;">
                 📎 There's something attached to this letter — open the app to see it.
               </div>`
            : ''
        }
      </div>

      ${
        APP_URL
          ? `<div style="text-align:center;margin-top:24px;">
               <a href="${APP_URL}/vault" style="display:inline-block;background:#ec4899;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;font-weight:600;">
                 Open in the app
               </a>
             </div>`
          : ''
      }

      <div style="text-align:center;margin-top:28px;color:#9f1239;font-size:11px;line-height:1.6;">
        This letter was sent because it was written to be opened today.<br>
        Only the two of you can see it in the app.
      </div>
    </div>
  </body>
</html>`
}

Deno.serve(async (req) => {
  const presented = (req.headers.get('Authorization') ?? '')
    .replace(/^Bearer\s+/i, '')
    .trim()

  if (![SERVICE_ROLE_KEY, SHARED_SECRET].filter(Boolean).includes(presented)) {
    return new Response('Forbidden', { status: 403 })
  }

  if (!smtpConfigured()) {
    console.error('SMTP_HOST / SMTP_USER / SMTP_PASS are not all set')
    return Response.json({ sent: 0, reason: 'not configured' })
  }

  let event: LetterEvent
  try {
    event = await req.json()
  } catch {
    return new Response('Bad request', { status: 400 })
  }

  const { data: item, error: itemError } = await db
    .from('vault_items')
    .select('id, label, author_id, recipient_id, unlock_at, unlock_type, unlocked_at')
    .eq('id', event.item_id)
    .single()

  if (itemError || !item) {
    return Response.json({ sent: 0, error: 'item not found' }, { status: 404 })
  }

  // Belt and braces: the RPC already checks this, but an email is irreversible
  // once sent, so verify here too rather than trusting the caller.
  const unlocked =
    item.unlocked_at !== null ||
    (item.unlock_type === 'date' && item.unlock_at && new Date(item.unlock_at) <= new Date())

  if (!unlocked) {
    console.error('refused to email a sealed letter', item.id)
    return Response.json({ sent: 0, error: 'still sealed' }, { status: 409 })
  }

  const { data: contents } = await db
    .from('vault_contents')
    .select('body, media_path')
    .eq('item_id', item.id)
    .maybeSingle()

  const recipientId = event.to_user_id ?? item.recipient_id

  const [{ data: recipientUser }, { data: authorProfile }] = await Promise.all([
    db.auth.admin.getUserById(recipientId),
    db.from('profiles').select('display_name').eq('id', item.author_id).single(),
  ])

  const to = recipientUser?.user?.email
  if (!to) {
    return Response.json({ sent: 0, reason: 'recipient has no email' })
  }

  try {
    await sendMail(
      to,
      `💌 ${item.label}`,
      renderEmail({
        label: item.label,
        body: contents?.body ?? null,
        authorName: authorProfile?.display_name ?? 'They',
        hasAttachment: Boolean(contents?.media_path),
      }),
    )
  } catch (error) {
    console.error('smtp send failed', error)
    return Response.json({ sent: 0, error: String(error) }, { status: 502 })
  }

  return Response.json({ sent: 1, reason: event.reason })
})
