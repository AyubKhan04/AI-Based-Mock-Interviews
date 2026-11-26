import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'

const ROUND_LABEL = { screening: 'Screening', technical: 'Technical', behavioural: 'Behavioural', hr: 'HR' }

export default function Practice() {
  const { user, catalog } = useApp()
  const nav = useNavigate()
  const tech = catalog?.fields?.find((f) => f.key === 'tech')
  const [form, setForm] = useState({
    field: 'Tech', role: user.fields[0]?.role || tech?.roles[0] || '', company: 'Any company', round_type: 'screening', difficulty: 'medium', count: 5,
  })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!catalog || catalog.error) return null
  const set = (k, v) => setForm({ ...form, [k]: v })

  async function start() {
    setErr(''); setBusy(true)
    try {
      const r = await api('/practice', { method: 'POST', body: { ...form, field: 'tech' } })
      sessionStorage.setItem(`note-${r.interview_id}`, r.source_note)
      nav(`/interview/${r.interview_id}`)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  const Chips = ({ k, options, label = (x) => x }) => (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => <button key={o} type="button" onClick={() => set(k, o)} className={form[k] === o ? 'btn py-1.5' : 'btn-ghost py-1.5'}>{label(o)}</button>)}
    </div>
  )

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Practice mode</h1>
        <p className="text-slate-500">One round at a time. No time limit, no pass or fail, a full report after every session.</p>
      </div>
      <div className="card space-y-5">
        <div><label className="label">Field</label><Chips k="field" options={['Tech']} /></div>
        <div><label className="label">Role</label><select className="input" value={form.role} onChange={(e) => set('role', e.target.value)}>{tech.roles.map((r) => <option key={r}>{r}</option>)}</select></div>
        <div><label className="label">Company style</label>
          <select className="input" value={form.company} onChange={(e) => set('company', e.target.value)}>{catalog.companies.map((c) => <option key={c}>{c}</option>)}</select>
          <p className="mt-1 text-xs text-slate-400">Questions are written in the public style of the company. Not affiliated with any company.{!catalog.ai_enabled && ' Company-style questions need the AI key, so common questions are used for now.'}</p>
        </div>
        <div><label className="label">Round</label><Chips k="round_type" options={catalog.rounds} label={(r) => ROUND_LABEL[r]} /></div>
        <div><label className="label">Difficulty</label><Chips k="difficulty" options={catalog.difficulties} label={(d) => d[0].toUpperCase() + d.slice(1)} /></div>
        <div><label className="label">Number of questions</label><Chips k="count" options={catalog.counts} /></div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full" onClick={start} disabled={busy || !form.role}>{busy ? 'Preparing questions…' : 'Start practice'}</button>
      </div>
    </div>
  )
}
