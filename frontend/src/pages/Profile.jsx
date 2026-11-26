import { useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'

export default function Profile() {
  const { user, setUser, catalog } = useApp()
  const [params] = useSearchParams()
  const nav = useNavigate()
  const [name, setName] = useState(user.name)
  const [roles, setRoles] = useState(user.fields.map((f) => f.role))
  const [notify, setNotify] = useState(user.email_notifications)
  const [mode, setMode] = useState(user.mode)
  const [msg, setMsg] = useState('')
  const tech = catalog?.fields?.find((f) => f.key === 'tech')

  async function save() {
    setMsg('')
    try {
      const u = await api('/me', { method: 'PUT', body: { name, mode, email_notifications: notify, fields: roles.map((role) => ({ field: 'tech', role })) } })
      setUser(u); setMsg('Saved.')
      if (params.get('welcome')) nav('/practice')
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
        <div className="mb-3 flex flex-wrap gap-2">
          {catalog?.fields?.map((f) => (
            <span key={f.key} className={`rounded-full px-3 py-1 text-sm ${f.live ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{f.label}{!f.live && ' (soon)'}</span>
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {tech?.roles.map((r) => (
            <label key={r} className="flex items-center gap-2 rounded-lg p-2 ring-1 ring-slate-200 hover:bg-slate-50">
              <input type="checkbox" checked={roles.includes(r)} onChange={() => toggle(r)} /> {r}
            </label>
          ))}
        </div>
      </section>
      <section className="card space-y-3">
        <h2 className="font-semibold">Mode</h2>
        <div className="flex gap-2">
          {['practice', 'mock'].map((m) => (
            <button key={m} onClick={() => setMode(m)} className={mode === m ? 'btn' : 'btn-ghost'}>{m === 'practice' ? 'Practice' : 'Mock'}</button>
          ))}
        </div>
        {mode === 'mock' && <p className="text-sm text-amber-700">Mock mode (all 4 rounds, pass/fail, one day to finish) is coming in the next version. Practice works now.</p>}
        <label className="flex items-center gap-2"><input type="checkbox" checked={notify} onChange={(e) => setNotify(e.target.checked)} /> Email me my feedback reports</label>
      </section>
      <div className="flex items-center gap-3"><button className="btn" onClick={save}>Save</button><span className="text-sm text-slate-500">{msg}</span></div>
    </div>
  )
}
