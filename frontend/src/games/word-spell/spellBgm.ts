/**
 * 美食餐车背景音乐 - 轻快爵士风格
 * 使用 Web Audio API 程序化生成
 */

let ctx: AudioContext | null = null
let isPlaying = false
let nodes: { osc: OscillatorNode; gain: GainNode }[] = []
let masterGain: GainNode | null = null

const CHORD_PROGRESSION = [
  [261.63, 329.63, 392.00],  // C major
  [293.66, 369.99, 440.00],  // D minor (approx)
  [349.23, 440.00, 523.25],  // F major
  [392.00, 493.88, 587.33],  // G major
]

const BASS_NOTES = [130.81, 146.83, 174.61, 196.00]

let chordIndex = 0
let beatTimer: ReturnType<typeof setInterval> | null = null

function createCtx() {
  if (!ctx) {
    ctx = new AudioContext()
  }
  return ctx
}

export function startSpellBgm() {
  if (isPlaying) return
  isPlaying = true

  const audioCtx = createCtx()
  if (audioCtx.state === 'suspended') audioCtx.resume()

  masterGain = audioCtx.createGain()
  masterGain.gain.value = 0.12
  masterGain.connect(audioCtx.destination)

  // 和弦垫底音
  const padGain = audioCtx.createGain()
  padGain.gain.value = 0.4
  padGain.connect(masterGain)

  function playChord() {
    // 清除旧的
    nodes.forEach(n => {
      try { n.osc.stop() } catch {}
    })
    nodes = []

    const chord = CHORD_PROGRESSION[chordIndex % CHORD_PROGRESSION.length]
    const bass = BASS_NOTES[chordIndex % BASS_NOTES.length]

    // 和弦音
    chord.forEach(freq => {
      const osc = audioCtx.createOscillator()
      const g = audioCtx.createGain()
      osc.type = 'sine'
      osc.frequency.value = freq
      g.gain.setValueAtTime(0, audioCtx.currentTime)
      g.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.1)
      g.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 1.0)
      osc.connect(g)
      g.connect(padGain)
      osc.start()
      nodes.push({ osc, gain: g })
    })

    // 低音
    const bassOsc = audioCtx.createOscillator()
    const bassG = audioCtx.createGain()
    bassOsc.type = 'triangle'
    bassOsc.frequency.value = bass
    bassG.gain.setValueAtTime(0, audioCtx.currentTime)
    bassG.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + 0.05)
    bassG.gain.linearRampToValueAtTime(0.2, audioCtx.currentTime + 0.8)
    bassOsc.connect(bassG)
    bassG.connect(padGain)
    bassOsc.start()
    nodes.push({ osc: bassOsc, gain: bassG })

    chordIndex++
  }

  playChord()
  beatTimer = setInterval(playChord, 1600)
}

export function stopSpellBgm() {
  isPlaying = false
  if (beatTimer) {
    clearInterval(beatTimer)
    beatTimer = null
  }
  nodes.forEach(n => {
    try { n.osc.stop() } catch {}
  })
  nodes = []
  if (masterGain) {
    masterGain.disconnect()
    masterGain = null
  }
}
