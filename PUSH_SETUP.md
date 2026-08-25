# Push notifications — setup

All the code is written. What's left needs your Firebase account, because the
credentials have to be yours.

**Until you finish this, nothing breaks.** `Push.init()` catches the missing
config, logs a line, and the app runs exactly as before — nudges still arrive
instantly whenever the app is open, over realtime. Push is what makes them
arrive when it *isn't*.

---

## How it works

```
  someone taps "I miss you"
          │
          ▼
  insert into nudges ─────► realtime ─────► partner's open app (already works)
          │
          ▼  trigger: on_nudge_push()
  dispatch_push() ── pg_net ──► Edge Function: send-push
                                      │
                                      ├─ looks up the partner's device tokens
                                      ├─ mints a Google access token
                                      └─ POST to FCM ──► the locked phone
```

Postgres never holds a Firebase credential. The Edge Function is the only thing
that does, and it only answers to callers presenting the service role key.

---

## 1. Firebase project

1. [console.firebase.google.com](https://console.firebase.google.com) → **Add project**
2. Google Analytics is not needed — turn it off.

## 2. Android app

1. In the project, **Add app → Android**
2. Package name — exactly:
   ```
   com.ourapp.our_app
   ```
3. Download **`google-services.json`** and put it at:
   ```
   mobile/android/app/google-services.json
   ```
4. Now add the Gradle plugin. It is deliberately not in the repo yet, because
   it fails the build when that JSON is missing.

   In `mobile/android/settings.gradle.kts`, inside the `plugins { }` block:
   ```kotlin
   id("com.google.gms.google-services") version "4.4.2" apply false
   ```

   In `mobile/android/app/build.gradle.kts`, inside its `plugins { }` block:
   ```kotlin
   id("com.google.gms.google-services")
   ```

5. Rebuild:
   ```bash
   cd mobile
   flutter clean
   flutter run --dart-define-from-file=.env.json
   ```

## 3. iOS app (skip if Android only)

Needs a paid Apple Developer account — push does not work on the free tier, and
**not at all on the iOS Simulator.** You need a physical device.

1. **Add app → iOS**, bundle ID `com.ourapp.ourApp` (check the value Xcode shows
   under Runner → General → Bundle Identifier and use that exactly)
2. Download **`GoogleService-Info.plist`**
3. Open `mobile/ios/Runner.xcworkspace` in Xcode, drag the file into the
   `Runner` group, tick *Copy items if needed*
4. Runner → **Signing & Capabilities** → **+ Capability** → add
   **Push Notifications** and **Background Modes** (tick *Remote notifications*)
5. In Apple Developer → Keys, create an **APNs Auth Key** (`.p8`). Upload it in
   Firebase under Project Settings → **Cloud Messaging** → *APNs Authentication
   Key*, with your Team ID and Key ID.

## 4. Service account for the Edge Function

1. Firebase → **Project Settings → Service accounts**
2. **Generate new private key** → downloads a JSON file
3. Keep it out of the repo. It is a full server credential.

## 5. Deploy the function

```bash
cd "our special app"

npx supabase link --project-ref jbxifrsesuyzpiuliwse

# --no-verify-jwt is required: the caller is Postgres with the service role
# key, not a signed-in user. The function checks that header itself.
npx supabase functions deploy send-push --no-verify-jwt

npx supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(cat ~/Downloads/your-service-account.json)"
```

On Windows PowerShell the last line is:

```powershell
npx supabase secrets set FIREBASE_SERVICE_ACCOUNT="$(Get-Content -Raw .\service-account.json)"
```

## 6. Run the migration and point it at the function

Run `supabase/migrations/0007_push.sql` in the SQL editor, then insert one
config row — replacing the key with your **service role** key from
Project Settings → API (the secret one, *not* the anon key):

```sql
insert into private.push_config (function_url, service_role_key)
values (
  'https://jbxifrsesuyzpiuliwse.supabase.co/functions/v1/send-push',
  'eyJhbGciOi...your-service-role-key...'
);
```

That key lives in a schema revoked from `anon` and `authenticated`, so no client
can read it — only the `SECURITY DEFINER` trigger function can.

---

## Testing it

1. Install on a real phone, sign in, accept the permission prompt
2. Check the token landed:
   ```sql
   select user_id, platform, created_at from device_tokens;
   ```
   No row means registration failed — check `flutter logs` for a line starting
   `Push`.
3. **Background the app.** This is the whole point; foreground shows a local
   notification instead.
4. From the other account (web is fine), tap **I miss you**.
5. Check what the function replied. `pg_net` records every response, so the
   easiest place to look is the SQL editor — no CLI needed:

   ```sql
   select id, status_code, content, error_msg, created
   from net._http_response
   order by created desc
   limit 5;
   ```

   A healthy call is `200` with `{"sent":1,"pruned":0}`.

   The dashboard has the full function logs too:
   `https://supabase.com/dashboard/project/<ref>/functions/send-push/logs`

   (There is no `supabase functions logs` subcommand — the CLI only does
   list / delete / download / deploy / new / serve.)

## When it doesn't work

| Symptom | Cause |
|---|---|
| `{ sent: 0, reason: 'no registered devices' }` | The phone never registered. Permission declined, or `google-services.json` is missing. |
| `{ sent: 0, reason: 'not configured' }` | `FIREBASE_SERVICE_ACCOUNT` secret isn't set. |
| Function never called at all | `private.push_config` is empty, or `pg_net` isn't enabled. |
| Android works, iOS silent | APNs key not uploaded to Firebase, or you're on the Simulator. |
| Worked, then stopped after reinstall | Expected — FCM issues a new token. The function prunes dead ones automatically. |

Note the triggers **swallow their own errors on purpose**. A failed push must
never roll back the nudge that caused it — the message is already saved, and it
will still arrive over realtime if the app is open.

---

## What also pushes

Besides nudges, `daily_answers` fires one: *"Esther answered 💌 — write yours to
unlock what they said."* It only fires for the **first** of the two answers.
Once you've both answered, the reveal happens in the app and a push would be
noise.

Add more by calling `dispatch_push(jsonb)` from any trigger and handling the new
`type` in the Edge Function's `notificationFor()`.

## Not done yet

**Web push.** The browser app still only gets nudges while it's open. It needs a
service worker plus the VAPID flow — a separate piece of work, and less
important, since the phone is where you'd want to be interrupted anyway.
