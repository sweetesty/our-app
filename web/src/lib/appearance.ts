import { REACTION_SET } from '../components/Reactions'

export const ACCENTS = [
  { value: 'rose', label: 'Rose', swatch: ['#4c0519', '#e11d48', '#f472b6'] },
  { value: 'violet', label: 'Violet', swatch: ['#2e1065', '#7c3aed', '#e879f9'] },
  { value: 'ocean', label: 'Ocean', swatch: ['#042f2e', '#0d9488', '#22d3ee'] },
  { value: 'ember', label: 'Ember', swatch: ['#451a03', '#d97706', '#fb923c'] },
  { value: 'forest', label: 'Forest', swatch: ['#022c22', '#059669', '#a3e635'] },
  { value: 'midnight', label: 'Midnight', swatch: ['#020617', '#475569', '#818cf8'] },
] as const

export const BACKGROUNDS = [
  { value: 'glow', label: 'Glow', hint: 'A soft gradient. The original.' },
  { value: 'plain', label: 'Plain', hint: 'One flat colour, nothing else.' },
  { value: 'aurora', label: 'Aurora', hint: 'Two blooms of light, drifting slowly.' },
  { value: 'stars', label: 'Stars', hint: 'Small points of light over the gradient.' },
] as const

export type Accent = (typeof ACCENTS)[number]['value']
export type Background = (typeof BACKGROUNDS)[number]['value']

/**
 * Paint the chosen palette onto <html>.
 *
 * Applied as attributes rather than by swapping stylesheets: every rose/pink
 * class in the app resolves through a CSS variable, so one attribute retints
 * all fifteen screens at once.
 *
 * Also written to localStorage and re-read on boot, because the couple row
 * arrives a moment after first paint — without it the app flashes rose on
 * every launch before settling into whatever you actually chose.
 */
export function applyAppearance(accent?: string | null, background?: string | null) {
  const root = document.documentElement
  const a = accent && ACCENTS.some((x) => x.value === accent) ? accent : 'rose'
  const b = background && BACKGROUNDS.some((x) => x.value === background) ? background : 'glow'

  root.dataset.accent = a
  root.dataset.bg = b

  try {
    localStorage.setItem('appearance', JSON.stringify({ accent: a, background: b }))
  } catch {
    // Private mode. The app still works, it just flashes on next launch.
  }
}

/** Called before React mounts, so the first paint is already the right colour. */
export function applyStoredAppearance() {
  try {
    const raw = localStorage.getItem('appearance')
    if (!raw) return applyAppearance(null, null)
    const saved = JSON.parse(raw) as { accent?: string; background?: string }
    applyAppearance(saved.accent, saved.background)
  } catch {
    applyAppearance(null, null)
  }
}

/** Their emoji if they picked some, otherwise the built-in set. */
export function reactionSet(custom?: string[] | null): string[] {
  if (custom && custom.length > 0) return custom
  return [...REACTION_SET]
}
