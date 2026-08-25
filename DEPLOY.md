# Deploying the web app to Vercel

The repo holds three things — `web/`, `mobile/`, `supabase/` — so the one setting
that matters is telling Vercel to build the `web` folder, not the repo root.

## 1. Import the project

1. [vercel.com/new](https://vercel.com/new) → import **sweetesty/our-app**
2. **Root Directory** → click *Edit* → choose **`web`**

   This is the step people miss. Left at the repo root, the build fails with
   "no package.json found".
3. Framework preset should auto-detect as **Vite**. Build command and output
   directory come from `web/vercel.json`, so leave them alone.

## 2. Environment variables

Add these under **Settings → Environment Variables**, for *Production*,
*Preview* and *Development*:

| Name | Value |
|---|---|
| `VITE_SUPABASE_URL` | `https://jbxifrsesuyzpiuliwse.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | your anon / publishable key |

Both are baked into the JavaScript bundle at build time — that is expected and
safe. The anon key is designed to be public; row-level security is what protects
your data, not secrecy of that key.

**Never add `SUPABASE_SERVICE_ROLE_KEY` here.** It bypasses every RLS policy. It
belongs only in the Edge Function's secrets.

Vite only exposes variables prefixed `VITE_`. Anything else is stripped.

## 3. Point Supabase Auth at the deployed URL

Otherwise email confirmation links will send people to `localhost`.

**Supabase → Authentication → URL Configuration:**

- **Site URL**: `https://your-project.vercel.app`
- **Redirect URLs**: add both
  - `https://your-project.vercel.app/**`
  - `http://localhost:5173/**` (so local dev keeps working)

## 4. Deploy

Push to `main` and Vercel builds automatically. First deploy takes a couple of
minutes.

---

## Checking the PWA worked

On the deployed URL (**not** localhost — service workers need HTTPS, and Vercel
gives you that automatically):

1. Chrome DevTools → **Application → Manifest**. Name, colours and all three
   icons should be listed with no warnings.
2. **Application → Service Workers** — one registered and activated.
3. Desktop Chrome shows an install icon in the address bar.
4. Android Chrome offers "Add to Home screen".
5. **iPhone: Share → Add to Home Screen.** There is no automatic prompt — Apple
   does not provide one, which is why `InstallPrompt.tsx` shows instructions
   instead of a button on iOS.

## Things that will bite you

**A stale service worker.** If an old build seems stuck, it is almost always
this. `vercel.json` sets `Cache-Control: max-age=0` on `/sw.js` to prevent it.
To clear one by hand: DevTools → Application → Service Workers → *Unregister*,
then hard reload.

**iOS push needs the installed app.** A Safari tab receives nothing, silently.
The site must be on the Home Screen, on iOS 16.4 or newer.

**Supabase free tier pauses after ~1 week of no activity.** The app will look
broken until you resume it from the dashboard. Worth knowing before you assume
you have a bug.

## Custom domain

Vercel → Settings → Domains. After adding one, go back and update the Supabase
Site URL and Redirect URLs to match, or sign-in emails will point at the old
address.
