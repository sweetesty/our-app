/**
 * Web Audio API synthesizer for tactile Whot card sounds.
 * Zero external audio files, works instantaneously and reliably across devices.
 */

let audioCtx: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (!audioCtx) {
    const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    if (AudioContextClass) {
      audioCtx = new AudioContextClass()
    }
  }
  if (audioCtx && audioCtx.state === 'suspended') {
    void audioCtx.resume()
  }
  return audioCtx
}

let soundEnabled = true

export function setWhotSoundEnabled(enabled: boolean) {
  soundEnabled = enabled
  try {
    localStorage.setItem('whot_sound_enabled', enabled ? 'true' : 'false')
  } catch {
    // Ignore localStorage errors
  }
}

export function isWhotSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true
  try {
    const val = localStorage.getItem('whot_sound_enabled')
    if (val !== null) return val === 'true'
  } catch {
    // Ignore
  }
  return soundEnabled
}

/** Satisfying crisp card slap on a felt table */
export function playCardSnap() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  // Pitch envelope: fast drop to mimic physical tap
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(260, now)
  osc.frequency.exponentialRampToValueAtTime(45, now + 0.08)

  gain.gain.setValueAtTime(0.4, now)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.09)
}

/** Smooth paper draw swoosh */
export function playMarketDraw() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = 'sine'
  osc.frequency.setValueAtTime(140, now)
  osc.frequency.exponentialRampToValueAtTime(320, now + 0.12)

  gain.gain.setValueAtTime(0.01, now)
  gain.gain.linearRampToValueAtTime(0.2, now + 0.04)
  gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(now)
  osc.stop(now + 0.14)
}

/** Energetic special card sound (Hold On, Pick 2, Whot 20, General Market) */
export function playSpecialWhoosh() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const notes = [440, 554.37, 659.25] // A major triad chime

  notes.forEach((freq, idx) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'triangle'
    osc.frequency.setValueAtTime(freq, now + idx * 0.04)

    gain.gain.setValueAtTime(0.2, now + idx * 0.04)
    gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.04 + 0.25)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now + idx * 0.04)
    osc.stop(now + idx * 0.04 + 0.26)
  })
}

/** Celebratory victory fanfare for "Check up! 🎉" */
export function playVictoryFanfare() {
  if (!soundEnabled) return
  const ctx = getAudioContext()
  if (!ctx) return

  const now = ctx.currentTime
  const melody = [
    { freq: 523.25, time: 0.0, dur: 0.12 }, // C5
    { freq: 659.25, time: 0.12, dur: 0.12 }, // E5
    { freq: 783.99, time: 0.24, dur: 0.15 }, // G5
    { freq: 1046.5, time: 0.40, dur: 0.35 }, // C6
  ]

  melody.forEach(({ freq, time, dur }) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()

    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, now + time)

    gain.gain.setValueAtTime(0.25, now + time)
    gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur)

    osc.connect(gain)
    gain.connect(ctx.destination)

    osc.start(now + time)
    osc.stop(now + time + dur + 0.02)
  })
}
