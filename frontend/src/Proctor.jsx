import { useEffect, useRef, useState } from 'react'
import { api } from './api'

/**
 * Proctoring for Mock and Perform rounds: fullscreen + camera on, 3 chances each.
 * Only on/off events go to the server. The camera picture never leaves the browser.
 */
const LIMIT = { tab: 5000, camera: 10000 }
let live = { id: null, stream: null } // survives page navigation, not a reload

export const proctorSession = {
  get: (id) => (live.id === id && live.stream ? live.stream : null),
  set: (id, stream) => { live = { id, stream } },
  end: () => {
    live.stream?.getTracks().forEach((t) => t.stop())
    live = { id: null, stream: null }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
  },
}

async function enterFullscreen() {
  if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
}

export async function getCamera() {
  return navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: false })
}

/** Rules screen. Starting needs a click, because browsers only allow fullscreen after one. */
export function RulesGate({ resumed, integrity, onStart, onCancel }) {
  const [agree, setAgree] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function go() {
    setBusy(true); setErr('')
    let stream
    try { stream = await getCamera() } catch { setBusy(false); return setErr('Please allow the camera. It is required for this round.') }
    try { await enterFullscreen() } catch { stream.getTracks().forEach((t) => t.stop()); setBusy(false); return setErr('Your browser blocked fullscreen. Please allow it and try again.') }
    try { await onStart(stream) } catch (e) { stream.getTracks().forEach((t) => t.stop()); setErr(e.message); setBusy(false) }
  }
  return (
    <div className="mx-auto max-w-xl card space-y-4">
      <h1 className="text-xl font-bold">{resumed ? 'Return to your interview' : 'Before you start: interview rules'}</h1>
      {resumed && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">You left the interview screen (for example by reloading). This used one of your tab chances.</p>}
      <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-700">
        <li>The round runs in <b>fullscreen</b>. Don't switch tabs, switch windows or leave fullscreen.</li>
        <li>If you do, you get <b>5 seconds</b> to come back, or you are disqualified.</li>
        <li>Your <b>camera must stay on</b>. If it goes off, you get <b>10 seconds</b> to turn it back on.</li>
        <li>You have <b>3 chances</b> for each (tab: {integrity.tab}/{integrity.chances} used, camera: {integrity.camera}/{integrity.chances} used). One more after that disqualifies you.</li>
        <li>Your camera is only shown to you. It is <b>never recorded, uploaded or judged</b>; only whether it is on or off is saved.</li>
        <li>The interviewer reads each question aloud. You can mute it, and type or speak your answers.</li>
      </ul>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} /> I understand the rules</label>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && <button className="btn-ghost" onClick={onCancel} disabled={busy}>Not now</button>}
        <button className="btn" disabled={!agree || busy} onClick={go}>{busy ? 'Starting…' : resumed ? 'Return in fullscreen' : 'Start in fullscreen'}</button>
      </div>
    </div>
  )
}

/** Watches the tab, fullscreen and camera while a proctored round is open. */
export function useProctor({ id, stream, setStream, active, onUpdate, onDisqualified }) {
  const [issues, setIssues] = useState({}) // kind -> deadline (ms)
  const ref = useRef({ issues: {}, blurSince: null, busy: {}, active })
  ref.current.active = active

  useEffect(() => {
    if (!active) return
    const r = ref.current
    const report = async (kind, timed_out) => {
      try {
        const res = await api(`/interviews/${id}/integrity`, { method: 'POST', body: { kind, timed_out } })
        onUpdate?.(res)
        if (res.disqualified && r.active) { r.active = false; onDisqualified(res.reason) }
      } catch { /* network blip: the next check tries again */ }
    }
    const tabOk = () => {
      if (document.hidden || !document.fullscreenElement) return false
      if (!document.hasFocus()) { r.blurSince = r.blurSince || Date.now(); return Date.now() - r.blurSince < 1500 }
      r.blurSince = null; return true
    }
    const camOk = () => { const t = stream?.getVideoTracks()[0]; return !!t && t.readyState === 'live' && t.enabled && !t.muted }
    const tick = () => {
      if (!r.active) return
      const ok = { tab: tabOk(), camera: camOk() }
      let changed = false
      for (const kind of ['tab', 'camera']) {
        const open = r.issues[kind]
        if (!ok[kind] && !open) { r.issues[kind] = Date.now() + LIMIT[kind]; changed = true; report(kind, false) }
        else if (ok[kind] && open) { delete r.issues[kind]; changed = true }
        else if (!ok[kind] && open && Date.now() > open && !r.busy[kind]) { r.busy[kind] = true; report(kind, true) }
      }
      if (changed) setIssues({ ...r.issues })
    }
    const t = setInterval(tick, 250)
    document.addEventListener('visibilitychange', tick)
    document.addEventListener('fullscreenchange', tick)
    window.addEventListener('blur', tick)
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); document.removeEventListener('fullscreenchange', tick); window.removeEventListener('blur', tick) }
  }, [active, id, stream]) // eslint-disable-line react-hooks/exhaustive-deps

  async function fixTab() { try { await enterFullscreen(); window.focus() } catch { /* needs another click */ } }
  async function fixCamera() {
    try { const s = await getCamera(); stream?.getTracks().forEach((t) => t.stop()); setStream(s) } catch { /* still off */ }
  }
  function pause() { ref.current.active = false; ref.current.issues = {}; setIssues({}) }
  return { issues, fixTab, fixCamera, pause }
}

export function ProctorOverlay({ issues, fixTab, fixCamera, integrity }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 200); return () => clearInterval(t) }, [])
  const kind = issues.tab ? 'tab' : issues.camera ? 'camera' : null
  if (!kind) return null
  const left = Math.max(0, Math.ceil((issues[kind] - Date.now()) / 1000))
  const used = integrity?.[kind] ?? 0
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-red-900/80 p-4" role="alertdialog" aria-live="assertive">
      <div className="w-full max-w-md rounded-2xl bg-white p-6 text-center shadow-2xl">
        <div className="text-6xl font-bold text-red-600">{left}</div>
        <h2 className="mt-2 text-xl font-bold">{kind === 'tab' ? 'Get back to interview tab or you are disqualified' : 'Turn your camera back on or you are disqualified'}</h2>
        <p className="mt-2 text-sm text-slate-600">Warning {Math.min(used, integrity?.chances ?? 3)} of {integrity?.chances ?? 3} for {kind === 'tab' ? 'leaving the tab or fullscreen' : 'the camera'}.</p>
        <button className="btn mt-4 w-full" onClick={kind === 'tab' ? fixTab : fixCamera}>{kind === 'tab' ? 'Return to fullscreen' : 'Turn camera on'}</button>
      </div>
    </div>
  )
}

export function BigCamera({ stream }) {
  const v = useRef(null)
  useEffect(() => { if (v.current && stream) v.current.srcObject = stream }, [stream])
  return (
    <div className="overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-slate-300">
      <video ref={v} autoPlay muted playsInline className="aspect-[4/3] w-full -scale-x-100 object-cover" aria-label="Your camera" />
      <div className="bg-slate-800 px-3 py-1.5 text-xs text-slate-300">● Camera on · only you can see this · never recorded</div>
    </div>
  )
}
