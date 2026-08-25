# Ours

A private space for two people. One Supabase backend, a React web app, and a
Flutter mobile app — all reading the same database, all locked to a single
couple.

Not a pink couples app. The reference is a dim room at night: deep ink-plum,
one candle. Warm gold carries anything that means *us*, rose is saved for the
intimate moments so it still lands when it shows up.

```
our special app/
├── supabase/migrations/   the whole backend — schema, RLS, storage, seed, RPCs
├── web/                   React + TypeScript + Tailwind (Vite)
└── mobile/                Flutter (Android + iOS)
```

---

## The seven things it does

| | Feature | Where the interesting part lives |
|---|---|---|
| 💌 | **Today, Us** — a daily question neither of you can read the other's answer to until you've both written yours | The reveal is an **RLS policy**, not a UI check. `daily_answers` only returns your partner's row once `has_answered()` says yours exists. |
| 🃏 | **The deck** — Love, Inside Jokes, Spicy, Dare, Deep, plus decks you write yourself | `draw_card()` never deals a card you've already played. Inside Jokes ships empty on purpose. |
| 📌 | **Love notes** — a wall of notes, pinnable, with unread markers | Only the author can edit the words; pinning and marking-read go through RPCs so your partner can act on a note without rewriting it. |
| 🗓️ | **Timeline** — milestones with photos, voice notes, video | Media sits in a private bucket, read through batched signed URLs. |
| 🔒 | **The vault** — letters that open on a date, or "when you miss me" | Split across two tables. `vault_items` holds the teaser; `vault_contents` holds the letter and **refuses to return the row until it's genuinely unlocked**. Peeking would mean bypassing Postgres, not the UI. |
| 🫂 | **Nudges** — I miss you, thinking of you, kiss me, proud of you | Realtime insert on `nudges`; the banner lands about as fast as they lift their thumb. |
| 🏆 | **Us** — a couple streak and achievements | A day only counts once **both** of you have answered. A streak you can extend alone isn't a couple streak. |

---

## Setup

### 1. Supabase

Create a project at [supabase.com](https://supabase.com), then run the
migrations **in order** in the SQL Editor:

```
supabase/migrations/0001_core.sql       couples, profiles, pairing RPCs
supabase/migrations/0002_features.sql   all seven feature tables
supabase/migrations/0003_rls.sql        row level security  ← do not skip
supabase/migrations/0004_storage.sql    private media bucket
supabase/migrations/0005_seed.sql       question bank, decks, achievements
supabase/migrations/0006_rpc.sql        today_question(), home_summary(), …
```

Or with the CLI:

```bash
npx supabase link --project-ref <your-ref>
npx supabase db push
```

Then in **Authentication → Providers → Email**, decide whether you want email
confirmation on. With it off, sign-up drops you straight in — reasonable for an
app only two people will ever use.

### 2. Web

```bash
cd web
cp .env.example .env.local     # fill in URL + anon key
npm install
npm run dev                    # http://localhost:5173
```

### 3. Mobile

Keys are passed at build time so nothing is committed:

```bash
cd mobile
cp .env.example.json .env.json     # fill in URL + anon key
flutter pub get
flutter run --dart-define-from-file=.env.json
```

Or inline:

```bash
flutter run \
  --dart-define=SUPABASE_URL=https://xxx.supabase.co \
  --dart-define=SUPABASE_ANON_KEY=eyJ...
```

Both `.env.local` and `.env.json` are gitignored. If the defines are missing the
app shows a setup screen instead of crashing.

---

## Pairing

1. One of you signs up and taps **Open a new space** → gets a six-character code.
2. The other signs up and taps **I have a code**.
3. The door closes. `join_couple()` raises if the space already has two people,
   and a trigger on `profiles` enforces the same rule at the table level.

Codes avoid `0/O/1/I/L` so nobody has to ask "is that a one or an ell".

---

## How privacy actually works

This is the part worth not hand-waving, since the whole idea rests on it.

- **Every table carries `couple_id`**, even where it's derivable by join. Each
  RLS policy is then one indexed comparison against `current_couple_id()`, and
  cross-couple leakage is impossible rather than merely unlikely.
- **`current_couple_id()` and friends are `SECURITY DEFINER`.** Without that, a
  policy on `profiles` that calls a function reading `profiles` recurses forever.
- **The reveal and the vault are enforced in Postgres.** Not in React, not in
  Flutter. With the anon key and a raw REST call, there is no query either of you
  can write that returns an unrevealed answer or an unopened letter.
- **Media is a private bucket.** Storage policies key off the first path
  segment (`<couple_id>/…`), and every read is a short-lived signed URL.
- **Writes that need judgement go through RPCs**, not table policies —
  `unlock_vault_item()` checks you're the recipient *and* that the date arrived;
  `mark_note_read()` refuses to touch your own notes.
- No profiles, no followers, no feed, no discovery, no algorithm. The web app
  ships `noindex, nofollow`.

The one honest caveat: you're both developers with the anon key, so you could
always query the database directly. The rules above mean the *database* won't
help you cheat — but they aren't a defence against someone with your credentials
and bad intentions. For two people who trust each other, that's the right line.

---

## Notes on the build

- **Web** — Vite + React 19 + Tailwind v4 (`@theme` tokens in `src/index.css`).
  `npm run build` is clean.
- **Mobile** — Flutter 3.44, Riverpod for the session, go_router for the three
  gates (signed in → paired → everything else). `flutter analyze` is clean and
  `flutter test` covers the vault unlock rules and formatting helpers.
- **Design tokens are mirrored** between `web/src/index.css` and
  `mobile/lib/theme.dart` so the two clients feel like one place. Change a
  colour in one, change it in the other.
- `mobile/lib/theme.dart` calls its palette class `Dusk`, not `Ink` — `Ink` is a
  Flutter widget and shadowing it breaks every card surface.

## Things worth doing next

- **Push notifications.** Nudges are realtime while the app is open; making them
  land on a locked phone needs FCM/APNs plus an Edge Function triggered on
  insert into `nudges`.
- **Voice note recording** on mobile — currently you can attach an existing
  audio file, but not record in-app (`record` package).
- **Inline audio/video playback** in the mobile vault; the web app plays both
  already, mobile shows a placeholder card.
- Avatar uploads (the schema has `avatar_url`, no UI writes it yet).
