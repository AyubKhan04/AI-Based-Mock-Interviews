import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import FieldRole, { StyleOptions, defaultFieldRole } from '../FieldRole'
import { RULES } from './Mock'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Perform() {
  const { user, catalog } = useApp()
  const nav = useNavigate()
  const [form, setForm] = useState(() => ({ ...defaultFieldRole(user, catalog), persona: 'neutral', panel: false, jd: '' }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!catalog || catalog.error) return null
  const av = user.availability

  async function start() {
    setErr(''); setBusy(true)
    try {
      const r = await api('/interviews', { method: 'POST', body: { ...form, mode: 'perform' } })
      nav(`/interview/${r.interview_id}`)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">⭐ Perform Mock Interview</h1>
        <p className="text-slate-500">The full experience: four rounds over four days, with the questions asked most often across many companies. Each round is booked in your preferred time and emailed to you, with a reminder an hour before. Pass a round and the next one is booked for the next available day.</p>
      </div>
      <div className="card space-y-5">
        <FieldRole form={form} set={(p) => setForm({ ...form, ...p })} />
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <b>Your availability:</b> {av.days.map((d) => DAYS[d]).join(', ')}, {av.start}–{av.end} ({av.tz}).{' '}
          <Link className="text-indigo-600" to="/profile">Change it</Link>
        </div>
        <StyleOptions form={form} set={(p) => setForm({ ...form, ...p })} />
        <RULES field={form.field} mode="full" />
        <p className="text-xs text-slate-400">Follow-up questions come on top. If a round is not started within a day of its slot, the interview ends as incomplete.</p>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full" onClick={start} disabled={busy || !form.role}>{busy ? 'Booking your first round…' : 'Book my interview'}</button>
      </div>
    </div>
  )
}
