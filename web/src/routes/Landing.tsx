import { Link } from 'react-router-dom'
import Logo, { APP_NAME, APP_TAGLINE } from '../components/Logo'
import { Button } from '../components/ui'

const FEATURES = [
  {
    emoji: '💌',
    name: 'Today, Us',
    line: 'One question a day. Neither of you can read their answer until you have written your own.',
    tilt: 'tilt-a',
    tape: 'taped-left',
  },
  {
    emoji: '🃏',
    name: 'The deck',
    line: 'Love, Spicy, Dare, Deep — and an Inside Jokes deck that ships empty, because only you two could write it.',
    tilt: 'tilt-b',
    tape: 'taped-right',
  },
  {
    emoji: '📌',
    name: 'Love notes',
    line: 'A wall of notes to find later. Pin the ones that should never scroll away.',
    tilt: 'tilt-c',
    tape: '',
  },
  {
    emoji: '🗓️',
    name: 'Timeline',
    line: 'The first call, the first trip, the ordinary Tuesday. Photos, voice notes and video stick to the page.',
    tilt: 'tilt-b',
    tape: 'taped-left',
  },
  {
    emoji: '🔒',
    name: 'The vault',
    line: 'Letters that open later — on a date you pick, or the moment they need it. Sealed until then, properly.',
    tilt: 'tilt-a',
    tape: 'taped-right',
  },
  {
    emoji: '🫂',
    name: 'Nudges',
    line: 'One tap. It lands on their phone in about a second. No message to compose, no reply expected.',
    tilt: 'tilt-c',
    tape: '',
  },
  {
    emoji: '🏆',
    name: 'Streaks',
    line: 'A day only counts once you have both answered. A streak you can keep alone is not a couple streak.',
    tilt: 'tilt-a',
    tape: 'taped-left',
  },
]

export default function Landing() {
  return (
    <div className="min-h-dvh">
      {/* nav */}
      <header className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-6">
        <div className="flex flex-1 items-center gap-2.5">
          <Logo size={34} />
          <span className="text-lg font-bold tracking-wide text-white">{APP_NAME}</span>
        </div>
        <Link
          to="/auth"
          className="rounded-full px-4 py-2 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          Sign in
        </Link>
      </header>

      {/* hero */}
      <section className="mx-auto max-w-5xl px-5 pt-10 pb-20 text-center sm:pt-16">
        <p className="animate-rise text-lg text-pink-300 italic">{APP_TAGLINE}</p>

        <h1 className="animate-rise mt-3 font-display text-5xl leading-[1.05] text-ink sm:text-7xl">
          An app with room
          <br />
          for exactly two people.
        </h1>

        <p className="animate-rise mx-auto mt-6 max-w-xl text-base leading-relaxed text-ink-muted sm:text-lg">
          No profiles. No followers. No feed, no algorithm, no strangers. Just a private
          scrapbook the two of you fill in — and a few things designed to make you actually
          say the thing.
        </p>

        <div className="animate-rise mt-9 flex flex-wrap items-center justify-center gap-3">
          <Link to="/auth">
            <Button size="lg">Make your space</Button>
          </Link>
          <Link to="/auth">
            <Button size="lg" variant="ghost">
              I have an invite code
            </Button>
          </Link>
        </div>

        <p className="mt-4 text-xs text-ink-faint">Free to start · two people, forever</p>

        {/* three cards on the table */}
        <div className="mt-16 flex flex-wrap items-start justify-center gap-5 sm:gap-8">
          <article className="paper taped tilt-a w-60 px-5 pt-9 pb-5 text-left">
            <p className="label">Today, Us</p>
            <p className="mt-2 font-display text-lg leading-snug text-ink">
              What's something I did recently that made you smile?
            </p>
            <p className="script mt-3 text-blush-600">sealed until you both answer</p>
          </article>

          <article className="paper taped taped-right tilt-b w-56 px-5 pt-9 pb-5 text-left">
            <p className="label">For you</p>
            <p className="script mt-2 text-ink-soft">
              Read this when you're having a bad day. You are doing so much better than you
              think you are.
            </p>
          </article>

          <article className="paper taped taped-left tilt-c w-52 px-5 pt-9 pb-7 text-left">
            <p className="mb-1 text-2xl">🔒</p>
            <p className="text-base text-ink">Open on your birthday</p>
            <p className="mt-1 text-xs text-ink-faint">opens in 3 months</p>
          </article>
        </div>
      </section>

      {/* the hook */}
      <section className="border-y border-line bg-sunken/50 py-20">
        <div className="mx-auto max-w-3xl px-5 text-center">
          <p className="label">The bit everyone remembers</p>
          <h2 className="mt-3 font-display text-3xl leading-tight text-ink sm:text-4xl">
            You don't get to see their answer
            <br />
            until you've written yours.
          </h2>
          <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-ink-muted">
            It sounds small. It changes everything. You answer honestly instead of
            answering <em>around</em> them — and then you both find out at once.
          </p>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-ink-faint">
            It isn't a rule the screen politely follows, either. The database itself refuses
            to hand over their answer until yours exists. Nobody can peek, including us.
          </p>
        </div>
      </section>

      {/* features */}
      <section className="mx-auto max-w-5xl px-5 py-20">
        <div className="mb-12 text-center">
          <p className="label">What's inside</p>
          <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
            Seven ways to keep showing up
          </h2>
        </div>

        <div className="columns-1 gap-6 sm:columns-2 lg:columns-3 [&>*]:mb-6">
          {FEATURES.map((f) => (
            <article
              key={f.name}
              className={`paper taped ${f.tape} ${f.tilt} break-inside-avoid px-6 pt-10 pb-6`}
            >
              <span className="text-3xl">{f.emoji}</span>
              <h3 className="mt-3 font-display text-xl text-ink">{f.name}</h3>
              <p className="mt-2 text-sm leading-relaxed text-ink-muted">{f.line}</p>
            </article>
          ))}
        </div>
      </section>

      {/* privacy */}
      <section className="border-y border-line bg-sunken/50 py-20">
        <div className="mx-auto max-w-3xl px-5">
          <div className="text-center">
            <p className="label">Why it's actually private</p>
            <h2 className="mt-3 font-display text-3xl text-ink sm:text-4xl">
              Built so that even we can't read it
            </h2>
          </div>

          <ul className="mx-auto mt-10 grid max-w-2xl gap-4 sm:grid-cols-2">
            {[
              ['👥', 'Two people. Full stop.', 'A third account cannot join your space. That limit is enforced by the database, not a setting.'],
              ['🙈', 'No profiles, no discovery', 'Nobody can find you here. There is no search, no suggestions, no feed to appear in.'],
              ['🔐', 'Sealed means sealed', 'A letter set for December is unreadable in June — the words are behind a database rule, not a locked button.'],
              ['🖼️', 'Your photos stay yours', 'Media sits in a private bucket. Every view is a short-lived signed link that expires.'],
            ].map(([icon, title, body]) => (
              <li key={title} className="surface p-5">
                <span className="text-xl">{icon}</span>
                <h3 className="mt-2 text-base text-ink">{title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* close */}
      <section className="mx-auto max-w-2xl px-5 py-24 text-center">
        <div className="mb-6 flex justify-center">
          <Logo size={76} />
        </div>
        <h2 className="font-display text-4xl leading-tight text-ink sm:text-5xl">
          Start the book tonight.
        </h2>
        <p className="script mt-3 text-2xl text-blush-600">
          the first page is the hardest one
        </p>
        <div className="mt-8 flex justify-center">
          <Link to="/auth">
            <Button size="lg">Make your space</Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-line py-10">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-3 px-5 text-center">
          <div className="flex items-center gap-2">
            <Logo size={22} />
            <span className="text-sm font-bold tracking-wide text-white">{APP_NAME}</span>
          </div>
          <p className="text-xs text-rose-400">{APP_TAGLINE}</p>
        </div>
      </footer>
    </div>
  )
}
