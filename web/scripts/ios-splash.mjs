/**
 * iOS launch screens.
 *
 * Safari will not synthesise a splash for a home-screen web app the way Chrome
 * does from the manifest — without these it shows a blank white page for the
 * second or two before the first paint, which is the first thing you see every
 * time you open the app.
 *
 * The awkward part is that iOS only accepts an image whose media query matches
 * the device *exactly*. A near-miss is not scaled, it is ignored, and you are
 * back to white. So there is one file per iPhone screen, and the list has to
 * grow as Apple adds sizes.
 *
 * Run with: npm run splash
 */

import sharp from 'sharp'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const publicDir = resolve(here, '..', 'public')
const outDir = resolve(publicDir, 'splash')

/** Matches --canvas and the manifest's background_color, so the splash, the
 *  status bar and the first painted frame are one continuous colour. */
const CANVAS = '#1a0b0f'
const SOURCE = resolve(publicDir, 'pwa-512x512.png')

/**
 * Every iPhone still running a current iOS, portrait only — the manifest locks
 * orientation, and a landscape set would double the file count for a screen
 * nobody sees.
 *
 * [css width, css height, device pixel ratio]
 */
const SCREENS = [
  [440, 956, 3], // 16 Pro Max
  [430, 932, 3], // 15/16 Pro Max, 14 Pro Max
  [428, 926, 3], // 14 Plus, 13/12 Pro Max
  [420, 912, 3], // 16 Plus
  [402, 874, 3], // 16 Pro
  [393, 852, 3], // 15/16, 15 Pro, 14 Pro
  [390, 844, 3], // 14, 13, 13 Pro, 12, 12 Pro
  [375, 812, 3], // 13 mini, 12 mini, 11 Pro, XS, X
  [414, 896, 3], // 11 Pro Max, XS Max
  [414, 896, 2], // 11, XR
  [414, 736, 3], // 8 Plus
  [375, 667, 2], // 8, SE 2nd/3rd
  [320, 568, 2], // SE 1st
]

await mkdir(outDir, { recursive: true })

const links = []

for (const [cssW, cssH, dpr] of SCREENS) {
  const width = cssW * dpr
  const height = cssH * dpr

  // A third of the narrow edge. Big enough to read as the app opening, small
  // enough that it never crowds a short screen.
  const mark = Math.round(Math.min(width, height) / 3)

  const logo = await sharp(SOURCE)
    .resize(mark, mark, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer()

  const name = `splash-${width}x${height}.png`

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: CANVAS,
    },
  })
    .composite([{ input: logo, gravity: 'centre' }])
    .png()
    .toFile(resolve(outDir, name))

  links.push(
    `    <link rel="apple-touch-startup-image" href="/splash/${name}" ` +
      `media="(device-width: ${cssW}px) and (device-height: ${cssH}px) ` +
      `and (-webkit-device-pixel-ratio: ${dpr}) and (orientation: portrait)" />`,
  )

  console.log(`  ${name}`)
}

// Beside the script, not in public/ — these are for pasting into index.html,
// and anything under public/ ships to the browser.
await writeFile(resolve(here, 'ios-splash-links.html'), links.join('\n') + '\n')

console.log(`\n${SCREENS.length} launch screens → public/splash/`)
console.log('Tags for index.html → scripts/ios-splash-links.html')
