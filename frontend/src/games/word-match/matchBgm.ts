/**
 * 翻牌配对背景音乐 - 轻松可爱风格
 * 使用 Web Audio API 程序化生成
 */

let ctx: AudioContext | null = null
let isPlaying = false
let masterGain: GainNode | null = null
let timers: ReturnType<typeof setInterval>[] = []
let activeOscs: OscillatorNode[] = []

// 可爱的五声音阶旋律音符 (C大调五声: C D E G A)
const MELODY_NOTES = [523.25, 587.33, 659.25, 783.99, 880.00, 1046.50]
// 温柔的和弦进行
const CHORDS = [
  [261.63, 329.63, 392.00],  // C
  [220.00, 261.63, 329.63],  // Am
  [349.23, 440.00, 523.25],  // F
  [392.00, 493.88, 587.33],  // G
]
const BASS = [130.81, 110.00, 174.61, 196.00]

let chordIdx = 0
let melodyStep = 0

function getCtx() {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

function playMelodyNote() {
  if (!isPlaying || !masterGain) return
  const audioCtx = getCtx()

  // 随机从五声音阶中选音，偶尔跳跃
  const noteIdx = (melodyStep + Math.floor(Math.random() * 3)) % MELODY_NOTES.length
  const freq = MELODY_NOTES[noteIdx]
  melodyStep++

  const osc = audioCtx.createOscillator()
  const gain = audioCtx.createGain()

  // 使用方波+正弦混合，类似音乐盒音色
  osc.type = 'sine'
  osc.frequency.value = freq

  gain.gain.setValueAtTime(0, audioCtx.currentTime)
  gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.6)

  osc.connect(gain)
  gain.connect(masterGain)
  osc.start()
  osc.stop(audioCtx.currentTime + 0.7)
  activeOscs.push(osc)
  osc.onended = () => {
    activeOscs = activeOscs.filter(o => o !== osc)
  }
}

function playChord() {
  if (!isPlaying || !masterGain) return
  const audioCtx = getCtx()

  const chord = CHORDS[chordIdx % CHORDS.length]
  const bass = BASS[chordIdx % BASS.length]
  chordIdx++

  // 和弦垫音
  chord.forEach(freq => {
    const osc = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    gain.gain.setValueAtTime(0, audioCtx.currentTime)
    gain.gain.linearRampToValueAtTime(0.08, audioCtx.currentTime + 0.1)
    gain.gain.linearRampToValueAtTime(0.04, audioCtx.currentTime + 1.8)
    gain.gain.linearRampToValueAtTime(0, audioCtx.currentTime + 2.0)
    osc.connect(gain)
    gain.connect(masterGain!)
    osc.start()
    osc.stop(audioCtx.currentTime + 2.0)
    activeOscs.push(osc)
    osc.onended = () => { activeOscs = activeOscs.filter(o => o !== osc) }
  })

  // 低音
  const bassOsc = audioCtx.createOscillator()
  const bassGain = audioCtx.createGain()
  bassOsc.type = 'triangle'
  bassOsc.frequency.value = bass
  bassGain.gain.setValueAtTime(0, audioCtx.currentTime)
  bassGain.gain.linearRampToValueAtTime(0.15, audioCtx.currentTime + 0.05)
  bassGain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 1.5)
  bassOsc.connect(bassGain)
  bassGain.connect(masterGain!)
  bassOsc.start()
  bassOsc.stop(audioCtx.currentTime + 1.6)
  activeOscs.push(bassOsc)
  bassOsc.onended = () => { activeOscs = activeOscs.filter(o => o !== bassOsc) }
}

export function startMatchBgm() {
  if (isPlaying) return
  isPlaying = true
  chordIdx = 0
  melodyStep = 0

  const audioCtx = getCtx()
  if (audioCtx.state === 'suspended') audioCtx.resume()

  masterGain = audioCtx.createGain()
  masterGain.gain.value = 0.15
  masterGain.connect(audioCtx.destination)

  // 和弦每 2 秒切换
  playChord()
  const chordTimer = setInterval(playChord, 2000)

  // 旋律每 400ms 一个音符（随机跳过制造节奏感）
  const melodyTimer = setInterval(() => {
    if (Math.random() > 0.3) {
      playMelodyNote()
    }
  }, 400)

  timers = [chordTimer, melodyTimer]
}

export function stopMatchBgm() {
  isPlaying = false
  timers.forEach(t => clearInterval(t))
  timers = []
  activeOscs.forEach(osc => {
    try { osc.stop() } catch {}
  })
  activeOscs = []
  if (masterGain) {
    masterGain.disconnect()
    masterGain = null
  }
}
