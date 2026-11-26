import { useEffect, useRef, useState } from 'react'

const SR = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition)

/**
 * Speak your answer. Uses the browser's free speech recognition and measures only
 * pace, long pauses and volume. Audio is never uploaded by this app.
 */
export function useVoice(onText) {
  const [on, setOn] = useState(false)
  const [level, setLevel] = useState(0)
  const rec = useRef(null)
  const stats = useRef(null)
  const audio = useRef(null)

  function reset() { stats.current = null }

  async function start() {
    if (!SR) return
    const r = new SR()
    r.continuous = true; r.interimResults = false; r.lang = navigator.language || 'en-US'
    const now = Date.now()
    stats.current = stats.current || { started: now, spoken: 0, last: now, long_pauses: 0, vol: [], segStart: now }
    stats.current.segStart = now; stats.current.last = now
    r.onresult = (e) => {
      const t = Date.now()
      if (t - stats.current.last > 3000) stats.current.long_pauses += 1
      stats.current.last = t
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) onText(e.results[i][0].transcript.trim())
    }
    r.onend = () => { if (rec.current === r) stop() }
    r.start(); rec.current = r; setOn(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const ctx = new AudioContext(); const an = ctx.createAnalyser(); an.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(an)
      const buf = new Uint8Array(an.fftSize)
      const id = setInterval(() => {
        an.getByteTimeDomainData(buf)
        let sum = 0; for (const v of buf) sum += ((v - 128) / 128) ** 2
        const rms = Math.sqrt(sum / buf.length); setLevel(rms)
        if (rms > 0.01) stats.current?.vol.push(rms)
      }, 200)
      audio.current = { stream, ctx, id }
    } catch { /* volume is optional */ }
  }

  function stop() {
    const r = rec.current; rec.current = null
    try { r?.stop() } catch { /* already stopped */ }
    if (stats.current) stats.current.spoken += (Date.now() - stats.current.segStart) / 1000
    if (audio.current) { clearInterval(audio.current.id); audio.current.stream.getTracks().forEach((t) => t.stop()); audio.current.ctx.close(); audio.current = null }
    setOn(false); setLevel(0)
  }

  /** Metrics for the answer, or null if the mic was not used. */
  function metrics() {
    if (on) stop()
    const s = stats.current
    if (!s || s.spoken < 2) return null
    const avg = s.vol.length ? s.vol.reduce((a, b) => a + b, 0) / s.vol.length : 1
    return { seconds: Math.round(s.spoken), long_pauses: s.long_pauses, too_quiet: avg < 0.03 }
  }

  useEffect(() => () => stop(), [])
  return { supported: !!SR, on, level, start, stop, metrics, reset }
}

export function MicButton({ voice }) {
  if (!voice.supported) return <span className="text-xs text-slate-400">Voice answers work in Chrome and Edge.</span>
  return (
    <button type="button" onClick={voice.on ? voice.stop : voice.start}
      className={voice.on ? 'inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white' : 'btn-ghost text-sm'}>
      {voice.on ? <>■ Stop <span className="h-2 w-10 overflow-hidden rounded bg-red-300"><span className="block h-2 bg-white" style={{ width: `${Math.min(100, voice.level * 400)}%` }} /></span></> : '🎤 Speak answer'}
    </button>
  )
}

/** Self-view only: makes the round feel real. Video is never recorded, uploaded or judged. */
export function Camera({ defaultOn }) {
  const [on, setOn] = useState(false)
  const [err, setErr] = useState('')
  const video = useRef(null)
  const stream = useRef(null)
  useEffect(() => { if (defaultOn) toggle() /* eslint-disable-line */ ; return () => stream.current?.getTracks().forEach((t) => t.stop()) }, [])
  async function toggle() {
    if (stream.current) { stream.current.getTracks().forEach((t) => t.stop()); stream.current = null; setOn(false); return }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ video: { width: 320, height: 240 } })
      if (video.current) video.current.srcObject = stream.current
      setOn(true); setErr('')
    } catch { setErr('Camera not available') }
  }
  return (
    <div className="flex items-center gap-3">
      <video ref={video} autoPlay muted playsInline className={`h-36 w-48 rounded-xl bg-slate-900 object-cover ${on ? '' : 'hidden'}`} />
      <div className="text-xs text-slate-500">
        <button type="button" className="btn-ghost py-1 text-xs" onClick={toggle}>{on ? 'Camera off' : '📷 Camera on'}</button>
        <div className="mt-1 max-w-48">{err || 'Self-view only. Never recorded, uploaded or judged.'}</div>
      </div>
    </div>
  )
}
