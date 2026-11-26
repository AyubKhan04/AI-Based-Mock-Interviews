import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api, token } from '../api'
import { useApp } from '../App'
import { readResume } from '../resume'

export default function Profile() {
  const { user, setUser, catalog } = useApp()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [name, setName] = useState(user.name)
  const [roles, setRoles] = useState(user.fields.map((f) => `${f.field}|${f.role}`))
  const [av, setAv] = useState(user.availability)
  const [notify, setNotify] = useState(user.email_notifications)
  const [mode, setMode] = useState(user.mode)
  const [msg, setMsg] = useState('')

  async function save() {
    setMsg('')
    try {
      const u = await api('/me', { method: 'PUT', body: { name, mode, email_notifications: notify, availability: av, fields: roles.map((k) => ({ field: k.split('|')[0], role: k.split('|')[1] })) } })
      setUser(u); setMsg('Saved.')
      if (params.get('welcome')) nav(u.mode === 'mock' ? '/mock' : '/practice')
    } catch (e) { setMsg(e.message) }
  }
  const toggle = (r) => setRoles(roles.includes(r) ? roles.filter((x) => x !== r) : [...roles, r])

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {params.get('welcome') && <div className="rounded-lg bg-indigo-50 p-3 text-indigo-800">Welcome! Pick the roles you are preparing for, then start practising.</div>}
      <h1 className="text-2xl font-bold">Profile</h1>
      {user.is_guest ? <SaveAccount /> : (
        <section className="card space-y-4">
          <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><label className="label">Email</label><input className="input bg-slate-100" value={user.email} disabled /></div>
        </section>)}
      <ResumeCard />
      <section className="card">
        <h2 className="mb-1 font-semibold">Fields & roles</h2>
        <p className="mb-3 text-sm text-slate-500">Add or remove any time. Your past scores are always kept.</p>
        {catalog?.fields?.map((f) => (
          <div key={f.key} className="mb-3">
            <div className="mb-1 text-sm font-semibold text-indigo-700">{f.label}</div>
            <div className="grid gap-2 sm:grid-cols-2">
              {f.roles.map((r) => (
                <label key={r} className="flex items-center gap-2 rounded-lg p-2 ring-1 ring-slate-200 hover:bg-slate-50">
                  <input type="checkbox" checked={roles.includes(`${f.key}|${r}`)} onChange={() => toggle(`${f.key}|${r}`)} /> {r}
                </label>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="card space-y-3">
        <h2 className="font-semibold">Mode</h2>
        <div className="flex gap-2">
          {['practice', 'mock'].map((m) => (
            <button key={m} onClick={() => setMode(m)} className={mode === m ? 'btn' : 'btn-ghost'}>{m === 'practice' ? 'Practice' : 'Mock'}</button>
          ))}
        </div>
        <p className="text-sm text-slate-500">{mode === 'mock' ? 'Mock mode: company interviews with all 4 rounds, pass or fail, finished within a day.' : 'Practice mode: one round at a time, no time limit, no pass or fail.'} Switch any time.</p>
        <label className="flex items-center gap-2"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email me my feedback reports</label>
      </section>
      <section className="card space-y-3">
        <h2 className="font-semibold">Availability for ⭐ Perform Mock Interview</h2>
        <div className="flex flex-wrap gap-2">
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d, i) => (
            <button key={d} type="button" onClick={() => setAv({ ...av, days: av.days.includes(i) ? av.days.filter((x) => x !== i) : [...av.days, i].sort() })}
              className={av.days.includes(i) ? 'btn py-1' : 'btn-ghost py-1'}>{d}</button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div><label className="label">From</label><input type="time" className="input" value={av.start} onChange={(e) => setAv({ ...av, start: e.target.value })} /></div>
          <div><label className="label">To</label><input type="time" className="input" value={av.end} onChange={(e) => setAv({ ...av, end: e.target.value })} /></div>
          <div><label className="label">Time zone</label><input className="input" list="tzs" value={av.tz} onChange={(e) => setAv({ ...av, tz: e.target.value })} />
            <datalist id="tzs">{(Intl.supportedValuesOf?.('timeZone') || ['Asia/Kolkata', 'Europe/London', 'America/New_York']).map((z) => <option key={z} value={z} />)}</datalist></div>
        </div>
        <p className="text-xs text-slate-400">Each round is booked at the start of your window on the next preferred day.</p>
      </section>
      <div className="flex items-center gap-3"><button className="btn" onClick={save}>Save</button><span className="text-sm text-slate-500">{msg}</span></div>
    </div>
  )
}

export function ResumeCard() {
  const { user, setUser } = useApp()
  const [paste, setPaste] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function save(t) {
    setBusy(true); setErr('')
    try { setUser(await api('/me/resume', { method: 'PUT', body: { text: t } })); setPaste(false); setText('') } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  async function onFile(e) {
    const f = e.target.files?.[0]; e.target.value = ''
    if (!f) return
    setBusy(true); setErr('')
    try { await save(await readResume(f)) } catch (x) { setErr(x.message); setBusy(false) }
  }
  async function remove() { setBusy(true); try { setUser(await api('/me/resume', { method: 'DELETE' })) } finally { setBusy(false) } }
  return (
    <section className="card space-y-3" id="resume">
      <div>
        <h2 className="font-semibold">Your resume</h2>
        <p className="text-sm text-slate-500">Like a real interviewer, the AI reads it and asks about your own projects and experience in the Screening round.</p>
      </div>
      {user.resume ? (
        <div className="space-y-2">
          <p className="text-sm text-emerald-700">✓ Resume added ({user.resume.chars.toLocaleString()} characters).</p>
          <pre className="max-h-32 overflow-auto whitespace-pre-wrap rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{user.resume.preview}…</pre>
        </div>
      ) : <p className="text-sm text-slate-500">No resume yet.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <label className={`btn-ghost cursor-pointer text-sm ${busy ? 'pointer-events-none opacity-60' : ''}`}>
          📄 {user.resume ? 'Replace with a PDF' : 'Upload PDF'}<input type="file" accept=".pdf,.txt,application/pdf,text/plain" className="hidden" onChange={onFile} disabled={busy} />
        </label>
        <button type="button" className="btn-ghost text-sm" onClick={() => setPaste(!paste)} disabled={busy}>Paste text</button>
        {user.resume && <button type="button" className="text-sm text-red-600 hover:underline" onClick={remove} disabled={busy}>Remove</button>}
        {busy && <span className="text-sm text-slate-500">Reading…</span>}
      </div>
      {paste && <div className="space-y-2">
        <textarea className="input min-h-36 text-sm" placeholder="Paste your resume text here" value={text} onChange={(e) => setText(e.target.value)} />
        <button type="button" className="btn text-sm" disabled={busy || text.trim().length < 50} onClick={() => save(text)}>Save resume</button>
      </div>}
      {err && <p className="text-sm text-red-600">{err}</p>}
      <p className="text-xs text-slate-400">The PDF is read in your browser. Only the text is saved, with email addresses, phone numbers and links removed. On the free AI tier Google may use text it receives to improve its models, so leave out anything private. Remove it any time.</p>
    </section>
  )
}

function SaveAccount() {
  const { setUser } = useApp()
  const [f, setF] = useState({ name: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  async function submit(e) {
    e.preventDefault(); setBusy(true); setErr('')
    try { const r = await api('/auth/upgrade', { method: 'POST', body: f }); token.set(r.token); setUser(r.user) } catch (x) { setErr(x.message) } finally { setBusy(false) }
  }
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })
  return (
    <form id="save" onSubmit={submit} className="card space-y-3 ring-2 ring-amber-300">
      <h2 className="font-semibold">Save your progress</h2>
      <p className="text-sm text-slate-500">Create a free account to keep your sessions, streak and badges, get reports by email and book a ⭐ Perform Mock Interview.</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <input className="input" placeholder="Name" required value={f.name} onChange={set('name')} />
        <input className="input" placeholder="Email" type="email" required value={f.email} onChange={set('email')} />
        <input className="input" placeholder="Password (8+)" type="password" minLength={8} required value={f.password} onChange={set('password')} autoComplete="new-password" />
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <button className="btn" disabled={busy}>{busy ? 'Saving…' : 'Create my account'}</button>
    </form>
  )
}
