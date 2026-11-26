import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'

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
      <section className="card space-y-4">
        <div><label className="label">Name</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label className="label">Email</label><input className="input bg-slate-100" value={user.email} disabled /></div>
      </section>
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
