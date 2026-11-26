import { useCallback, useEffect, useRef, useState } from 'react'

/** AI interviewer voice: reads questions aloud with the browser's free speechSynthesis. */
export function useSpeaker() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window
  const [muted, setMuted] = useState(() => { try { return localStorage.getItem('voiceMuted') === '1' } catch { return false } })
  const [speaking, setSpeaking] = useState(false)

  useEffect(() => { if (supported) window.speechSynthesis.getVoices() }, [supported]) // voices load lazily in Chrome

  const timer = useRef(null)
  /** text can be a list of parts: each is spoken after a short, natural pause. */
  const speak = useCallback((text, force = false) => {
    const parts = (Array.isArray(text) ? text : [text]).map((t) => (t || '').trim()).filter(Boolean)
    if (!supported || !parts.length || (muted && !force)) return
    const synth = window.speechSynthesis
    synth.cancel(); clearTimeout(timer.current)
    const voices = synth.getVoices()
    const voice = voices.find((v) => /en[-_](IN|GB|US)/i.test(v.lang) && /natural|google|microsoft/i.test(v.name)) || voices.find((v) => v.lang?.startsWith('en')) || null
    const say = (i) => {
      const u = new SpeechSynthesisUtterance(parts[i])
      u.voice = voice
      u.rate = 0.95
      u.onstart = () => setSpeaking(true)
      u.onend = () => { if (i + 1 < parts.length) timer.current = setTimeout(() => say(i + 1), 550); else setSpeaking(false) }
      u.onerror = () => setSpeaking(false)
      synth.speak(u)
    }
    say(0)
  }, [muted, supported])

  function toggleMute() {
    const m = !muted
    setMuted(m)
    try { localStorage.setItem('voiceMuted', m ? '1' : '0') } catch { /* private mode */ }
    if (m && supported) window.speechSynthesis.cancel()
  }

  useEffect(() => () => { if (supported) window.speechSynthesis.cancel() }, [supported])
  const stop = useCallback(() => { clearTimeout(timer.current); if (supported) window.speechSynthesis.cancel(); setSpeaking(false) }, [supported])
  return { supported, muted, speaking, speak, stop, toggleMute }
}

export function SpeakerControls({ speaker, text }) {
  if (!speaker.supported) return null
  return (
    <span className="ml-2 inline-flex gap-1 align-middle">
      <button type="button" className="rounded px-1.5 py-0.5 text-xs text-indigo-700 hover:bg-indigo-50" onClick={() => speaker.speak(text, true)} title="Read the question again">🔊 Replay</button>
      <button type="button" className="rounded px-1.5 py-0.5 text-xs text-slate-500 hover:bg-slate-100" onClick={speaker.toggleMute} title={speaker.muted ? 'Turn the interviewer voice on' : 'Mute the interviewer voice'}>
        {speaker.muted ? '🔇 Voice off' : '🗣 Voice on'}</button>
    </span>
  )
}
