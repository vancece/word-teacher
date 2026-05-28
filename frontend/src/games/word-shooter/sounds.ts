/**
 * 游戏音效系统 - 使用 Web Audio API 程序化生成
 */

let audioCtx: AudioContext | null = null
let bgmGain: GainNode | null = null
let bgmTimers: ReturnType<typeof setInterval>[] = []
let isBgmPlaying = false

function getCtx(): AudioContext {
  if (!audioCtx || audioCtx.state === 'closed') {
    audioCtx = new AudioContext()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume()
  }
  return audioCtx
}

// 正确音效 - 明亮上升音
export function playCorrect() {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(523, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(784, ctx.currentTime + 0.1)
  osc.frequency.exponentialRampToValueAtTime(1047, ctx.currentTime + 0.15)
  gain.gain.setValueAtTime(0.3, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.3)
}

// 错误音效 - 低沉下降音
export function playWrong() {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(300, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.3)
  gain.gain.setValueAtTime(0.2, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.3)
}

// 连击音效 - 快速上升琶音
export function playCombo(comboCount: number) {
  const ctx = getCtx()
  const baseFreq = 400 + comboCount * 50
  for (let i = 0; i < 3; i++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(baseFreq + i * 200, ctx.currentTime + i * 0.05)
    gain.gain.setValueAtTime(0.2, ctx.currentTime + i * 0.05)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.05 + 0.15)
    osc.start(ctx.currentTime + i * 0.05)
    osc.stop(ctx.currentTime + i * 0.05 + 0.15)
  }
}

// 升级音效 - 大琶音
export function playLevelUp() {
  const ctx = getCtx()
  const notes = [523, 659, 784, 1047]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.1)
    gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.1)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.1 + 0.4)
    osc.start(ctx.currentTime + i * 0.1)
    osc.stop(ctx.currentTime + i * 0.1 + 0.4)
  })
}

// 失败音效 - 沉闷低音
export function playLoseLife() {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'triangle'
  osc.frequency.setValueAtTime(200, ctx.currentTime)
  osc.frequency.exponentialRampToValueAtTime(60, ctx.currentTime + 0.5)
  gain.gain.setValueAtTime(0.3, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.5)
}

// Game Over 音效
export function playGameOver() {
  const ctx = getCtx()
  const notes = [392, 349, 330, 262]
  notes.forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(freq, ctx.currentTime + i * 0.2)
    gain.gain.setValueAtTime(0.25, ctx.currentTime + i * 0.2)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.2 + 0.5)
    osc.start(ctx.currentTime + i * 0.2)
    osc.stop(ctx.currentTime + i * 0.2 + 0.5)
  })
}

// 战斗背景音乐 - 紧张刺激
export function startBgm() {
  if (isBgmPlaying) return
  isBgmPlaying = true

  const ctx = getCtx()
  bgmGain = ctx.createGain()
  bgmGain.gain.setValueAtTime(0.12, ctx.currentTime)
  bgmGain.connect(ctx.destination)

  // --- 层1: 低音 bass line (Am 小调，快速) ---
  const bassNotes = [
    110, 110, 131, 131, 147, 147, 131, 131,   // A2 A2 C3 C3 D3 D3 C3 C3
    110, 110, 98, 98, 131, 147, 131, 110,      // A2 A2 G2 G2 C3 D3 C3 A2
    147, 147, 165, 165, 196, 196, 165, 147,    // D3 D3 E3 E3 G3 G3 E3 D3
    131, 131, 110, 110, 98, 110, 131, 147,     // C3 C3 A2 A2 G2 A2 C3 D3
  ]
  let bassIdx = 0

  const playBass = () => {
    if (!isBgmPlaying || !bgmGain) return
    const c = getCtx()
    const osc = c.createOscillator()
    const g = c.createGain()
    const filter = c.createBiquadFilter()
    osc.connect(filter)
    filter.connect(g)
    g.connect(bgmGain!)
    osc.type = 'sawtooth'
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(400, c.currentTime)
    osc.frequency.setValueAtTime(bassNotes[bassIdx], c.currentTime)
    g.gain.setValueAtTime(0.6, c.currentTime)
    g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.18)
    osc.start(c.currentTime)
    osc.stop(c.currentTime + 0.2)
    bassIdx = (bassIdx + 1) % bassNotes.length
  }

  // --- 层2: 鼓点节奏 (噪声合成) ---
  let drumBeat = 0

  const playDrum = () => {
    if (!isBgmPlaying || !bgmGain) return
    const c = getCtx()
    const beat = drumBeat % 8

    // 底鼓 (每拍)
    if (beat === 0 || beat === 4) {
      const osc = c.createOscillator()
      const g = c.createGain()
      osc.connect(g)
      g.connect(bgmGain!)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(80, c.currentTime)
      osc.frequency.exponentialRampToValueAtTime(30, c.currentTime + 0.12)
      g.gain.setValueAtTime(0.7, c.currentTime)
      g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.15)
      osc.start(c.currentTime)
      osc.stop(c.currentTime + 0.15)
    }

    // 军鼓 (反拍)
    if (beat === 2 || beat === 6) {
      const bufferSize = 1024
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
      }
      const noise = c.createBufferSource()
      noise.buffer = buffer
      const bandpass = c.createBiquadFilter()
      bandpass.type = 'bandpass'
      bandpass.frequency.setValueAtTime(3000, c.currentTime)
      bandpass.Q.setValueAtTime(1.5, c.currentTime)
      const g = c.createGain()
      noise.connect(bandpass)
      bandpass.connect(g)
      g.connect(bgmGain!)
      g.gain.setValueAtTime(0.35, c.currentTime)
      g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.1)
      noise.start(c.currentTime)
      noise.stop(c.currentTime + 0.1)
    }

    // 踩镲 (每个八分音符)
    {
      const bufferSize = 512
      const buffer = c.createBuffer(1, bufferSize, c.sampleRate)
      const data = buffer.getChannelData(0)
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
      }
      const noise = c.createBufferSource()
      noise.buffer = buffer
      const hipass = c.createBiquadFilter()
      hipass.type = 'highpass'
      hipass.frequency.setValueAtTime(8000, c.currentTime)
      const g = c.createGain()
      noise.connect(hipass)
      hipass.connect(g)
      g.connect(bgmGain!)
      const vol = (beat % 2 === 0) ? 0.12 : 0.06
      g.gain.setValueAtTime(vol, c.currentTime)
      g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.06)
      noise.start(c.currentTime)
      noise.stop(c.currentTime + 0.06)
    }

    drumBeat++
  }

  // --- 层3: 紧张的高音旋律 (Am 小调，每4拍一个音) ---
  const melodyNotes = [
    880, 784, 659, 784,     // A5 G5 E5 G5
    880, 1047, 988, 784,    // A5 C6 B5 G5
    659, 784, 880, 659,     // E5 G5 A5 E5
    587, 659, 784, 880,     // D5 E5 G5 A5
  ]
  let melodyIdx = 0
  let melodyCounter = 0

  const playMelody = () => {
    if (!isBgmPlaying || !bgmGain) return
    melodyCounter++
    if (melodyCounter % 4 !== 0) return  // 每4个鼓点播一个旋律音

    const c = getCtx()
    const osc = c.createOscillator()
    const g = c.createGain()
    const filter = c.createBiquadFilter()
    osc.connect(filter)
    filter.connect(g)
    g.connect(bgmGain!)
    osc.type = 'square'
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(2000, c.currentTime)
    osc.frequency.setValueAtTime(melodyNotes[melodyIdx], c.currentTime)
    g.gain.setValueAtTime(0.15, c.currentTime)
    g.gain.setValueAtTime(0.15, c.currentTime + 0.25)
    g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 0.4)
    osc.start(c.currentTime)
    osc.stop(c.currentTime + 0.42)
    melodyIdx = (melodyIdx + 1) % melodyNotes.length
  }

  // --- 层4: 紧张的弦乐持续音 (Am 和弦 pad) ---
  const playPad = () => {
    if (!isBgmPlaying || !bgmGain) return
    const c = getCtx()
    const padGain = c.createGain()
    padGain.connect(bgmGain!)
    padGain.gain.setValueAtTime(0.08, c.currentTime)

    // Am 和弦: A3 C4 E4
    const padFreqs = [220, 262, 330]
    padFreqs.forEach(freq => {
      const osc = c.createOscillator()
      const g = c.createGain()
      osc.connect(g)
      g.connect(padGain)
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, c.currentTime)
      // 缓慢颤音
      const lfo = c.createOscillator()
      const lfoGain = c.createGain()
      lfo.connect(lfoGain)
      lfoGain.connect(osc.frequency)
      lfo.frequency.setValueAtTime(4, c.currentTime)
      lfoGain.gain.setValueAtTime(3, c.currentTime)
      lfo.start(c.currentTime)
      lfo.stop(c.currentTime + 3.5)

      g.gain.setValueAtTime(0.4, c.currentTime)
      g.gain.setValueAtTime(0.4, c.currentTime + 2.8)
      g.gain.exponentialRampToValueAtTime(0.01, c.currentTime + 3.4)
      osc.start(c.currentTime)
      osc.stop(c.currentTime + 3.5)
    })
  }

  // BPM ~150, 八分音符间隔 = 60/150/2 = 0.2s = 200ms
  const eighthNote = 200

  playBass()
  playDrum()
  playMelody()
  playPad()

  const bassTimer = setInterval(playBass, eighthNote)
  const drumTimer = setInterval(playDrum, eighthNote)
  const melodyTimer = setInterval(playMelody, eighthNote)
  const padTimer = setInterval(playPad, 3400)

  bgmTimers = [bassTimer, drumTimer, melodyTimer, padTimer]
}

export function stopBgm() {
  isBgmPlaying = false
  for (const timer of bgmTimers) {
    clearInterval(timer)
  }
  bgmTimers = []
  if (bgmGain) {
    bgmGain.gain.setValueAtTime(0, getCtx().currentTime)
    bgmGain = null
  }
}

// 城堡被命中音效 - 沉重撞击 + 碎裂感
export function playCastleHit() {
  const ctx = getCtx()
  // 沉重撞击低音
  const osc1 = ctx.createOscillator()
  const g1 = ctx.createGain()
  osc1.connect(g1)
  g1.connect(ctx.destination)
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(120, ctx.currentTime)
  osc1.frequency.exponentialRampToValueAtTime(40, ctx.currentTime + 0.3)
  g1.gain.setValueAtTime(0.4, ctx.currentTime)
  g1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.35)
  osc1.start(ctx.currentTime)
  osc1.stop(ctx.currentTime + 0.35)

  // 碎裂噪声
  const bufferSize = 4096
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
  const data = buffer.getChannelData(0)
  for (let i = 0; i < bufferSize; i++) {
    data[i] = (Math.random() * 2 - 1) * (1 - i / bufferSize)
  }
  const noise = ctx.createBufferSource()
  noise.buffer = buffer
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.setValueAtTime(1500, ctx.currentTime)
  lp.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.25)
  const g2 = ctx.createGain()
  noise.connect(lp)
  lp.connect(g2)
  g2.connect(ctx.destination)
  g2.gain.setValueAtTime(0.3, ctx.currentTime)
  g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3)
  noise.start(ctx.currentTime)
  noise.stop(ctx.currentTime + 0.3)
}

// 魔王受伤音效 - 尖啸 + 受击钝音
export function playBossHit() {
  const ctx = getCtx()
  // 高频尖啸（受击反馈）
  const osc1 = ctx.createOscillator()
  const g1 = ctx.createGain()
  osc1.connect(g1)
  g1.connect(ctx.destination)
  osc1.type = 'sawtooth'
  osc1.frequency.setValueAtTime(1200, ctx.currentTime)
  osc1.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.15)
  g1.gain.setValueAtTime(0.2, ctx.currentTime)
  g1.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.18)
  osc1.start(ctx.currentTime)
  osc1.stop(ctx.currentTime + 0.18)

  // 钝击低音
  const osc2 = ctx.createOscillator()
  const g2 = ctx.createGain()
  osc2.connect(g2)
  g2.connect(ctx.destination)
  osc2.type = 'triangle'
  osc2.frequency.setValueAtTime(250, ctx.currentTime + 0.02)
  osc2.frequency.exponentialRampToValueAtTime(80, ctx.currentTime + 0.2)
  g2.gain.setValueAtTime(0.3, ctx.currentTime + 0.02)
  g2.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.25)
  osc2.start(ctx.currentTime + 0.02)
  osc2.stop(ctx.currentTime + 0.25)
}

// 点击音效 - 轻快的点击声
export function playClick() {
  const ctx = getCtx()
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(800, ctx.currentTime)
  gain.gain.setValueAtTime(0.15, ctx.currentTime)
  gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.08)
  osc.start(ctx.currentTime)
  osc.stop(ctx.currentTime + 0.08)
}
