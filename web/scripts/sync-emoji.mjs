/**
 * Copies the Twemoji SVGs into public/emoji so they ship with the build.
 *
 * Emoji were being drawn by whatever font the device happened to have. On the
 * phones that means Apple's set; in Chrome on Windows it means Google's, which
 * is a different drawing, a different palette and — for a couple looking at the
 * same nudge on two devices — visibly not the same picture. Twemoji is one set,
 * CC-BY 4.0, and it looks the same everywhere.
 *
 * Run automatically before a build. Roughly 3,700 files, about 17MB on disk,
 * but each one is a couple of kilobytes and only the ones actually on screen
 * are ever fetched — which is why they are deliberately kept out of the service
 * worker's precache and cached at runtime instead.
 */
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const from = join(here, '..', 'node_modules', '@twemoji', 'svg')
const to = join(here, '..', 'public', 'emoji')

if (!existsSync(from)) {
  console.error('[emoji] @twemoji/svg is not installed — run npm install')
  process.exit(1)
}

const source = (await readdir(from)).filter((f) => f.endsWith('.svg'))

// Skip the copy when it has already been done — this runs before every build
// and the files never change within a version.
if (existsSync(to)) {
  const existing = (await readdir(to)).filter((f) => f.endsWith('.svg'))
  if (existing.length === source.length) {
    console.log(`[emoji] ${existing.length} already in public/emoji`)
    process.exit(0)
  }
  await rm(to, { recursive: true, force: true })
}

await mkdir(to, { recursive: true })
await Promise.all(source.map((f) => cp(join(from, f), join(to, f))))

const bytes = (await Promise.all(source.map((f) => stat(join(to, f))))).reduce(
  (n, s) => n + s.size,
  0,
)
console.log(`[emoji] copied ${source.length} svgs (${(bytes / 1024 / 1024).toFixed(1)}MB)`)
