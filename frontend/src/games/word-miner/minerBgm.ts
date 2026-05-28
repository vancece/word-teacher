/**
 * 黄金矿工专属背景音乐 - 矿洞冒险风格
 * 使用 Web Audio API 程序化生成，深沉的低音 + 轻快的打击节奏
 */

let audioCtx: AudioContext | null = null
let masterGain: GainNode | null = null
let isPlaying = false
let bassInterval: ReturnType<typeof setInterval> | null = null
let percInterval: ReturnType<typeof setInterval> | null = null
let melodyInterval: ReturnType<typeof setInterval> | null = null

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

// 低音 bass line - 矿洞深处的回响
const bassNotes = [
  82, 82, 110, 98, // E2, E2, A2, G2
  82, 82, 123, 110, // E2, E2, B2, A2
  73, 73, 98, 82, // D2, D2, G2, E2
  98, 110, 82, 73, // G2, A2, E2, D2
]

// 旋律 - 轻快的矿工小调
const melodyNotes = [
  330, 392, 440, 392, // E4, G4, A4, G4
  330, 294, 330, 0,   // E4, D4, E4, rest
  440, 494, 523, 494, // A4, B4, C5, B4
  440, 392, 330, 0,   // A4, G4, E4, rest
]

let bassIndex = 0
let melodyIndex = 0

function playBassNote() {
  if (!isPlaying || !masterGain) return
  const ctx = getCtx()
  const freq = bassNotes[bassIndex]
  bassIndex = (bassIndex + 1) % bassNotes.length

  if (freq === 0) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(masterGain)
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(freq, ctx.currentTime)
  gain.gain.setValueAtTime(0.35, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.45)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.45)
}

function playPercussion() {
  if (!isPlaying || !masterGain) return
  const ctx = getCtx()

  // 模拟铁锤敲击声
  const bufferSize = ctx.sampleRate * 0.05
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.1))
  }

  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  const filter = ctx.createBiquadFilter()
  filter.type = 'highpass'
  filter.frequency.setValueAtTime(800, ctx.currentTime)
  const gain = ctx.createGain()
  gain.gain.setValueAtTime(0.12, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08)

  noise.connect(filter)
  filter.connect(gain)
  gain.connect(masterGain)
  noise.start(ctx.currentTime)
}

function playMelodyNote() {
  if (!isPlaying || !masterGain) return
  const ctx = getCtx()
  const freq = melodyNotes[melodyIndex]
  melodyIndex = (melodyIndex + 1) % melodyNotes.length

  if (freq === 0) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(masterGain)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(freq, ctx.currentTime)
  gain.gain.setValueAtTime(0.12, ctx.currentTime)
  gain.gain.setValueAtTime(0.12, ctx.currentTime + 0.15)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.4)
}

export const MinerBgm = {
  start() {
    if (isPlaying) return
    isPlaying = true
    bassIndex = 0
    melodyIndex = 0

    const ctx = getCtx()
    masterGain = ctx.createGain()
    masterGain.gain.setValueAtTime(0.4, ctx.currentTime)
    masterGain.connect(ctx.destination)

    // Bass: 每拍一个音 (BPM ~100)
    playBassNote()
    bassInterval = setInterval(playBassNote, 600)

    // 打击: 每 300ms 一次（敲击声）
    setTimeout(() => {
      if (!isPlaying) return
      playPercussion()
      percInterval = setInterval(playPercussion, 600)
    }, 300)

    // 旋律: 每拍（偏移一小节后开始）
    setTimeout(() => {
      if (!isPlaying) return
      playMelodyNote()
      melodyInterval = setInterval(playMelodyNote, 600)
    }, 2400)
  },

  stop() {
    isPlaying = false
    if (bassInterval) { clearInterval(bassInterval); bassInterval = null }
    if (percInterval) { clearInterval(percInterval); percInterval = null }
    if (melodyInterval) { clearInterval(melodyInterval); melodyInterval = null }
    if (masterGain) {
      const ctx = getCtx()
      masterGain.gain.setValueAtTime(masterGain.gain.value, ctx.currentTime)
      masterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5)
      setTimeout(() => { masterGain = null }, 600)
    }
  },
}
