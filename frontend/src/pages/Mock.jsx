import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import FieldRole, { ROUND_LABEL, defaultFieldRole } from '../FieldRole'

export const RULES = ({ counts }) => {
  const { catalog } = useApp()
  return (
    <table className="w-full text-left text-sm">
      <thead className="text-slate-500"><tr><th className="py-1">Round</th><th>Questions</th><th>Pass mark</th></tr></thead>
      <tbody>{catalog.rounds.map((r) => (
        <tr key={r} className="border-t border-slate-100"><td className="py-1.5">{ROUND_LABEL[r]}</td><td>{counts[r]}</td><td>{catalog.pass_marks[r]}+/10</td></tr>
      ))}</tbody>
    </table>
  )
}

export default function Mock() {
  const { user, catalog } = useApp()
  const nav = useNavigate()
  const [form, setForm] = useState(() => ({ ...defaultFieldRole(user, catalog), company: 'Any company' }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!catalog || catalog.error) return null
  const set = (patch) => setForm({ ...form, ...patch })

  async function start() {
    setErr(''); setBusy(true)
    try {
      const r = await api('/interviews', { method: 'POST', body: { ...form, mode: 'mock' } })
      nav(`/interview/${r.interview_id}`)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Mock mode</h1>
        <p className="text-slate-500">A company-style interview with all four rounds and a quarter of the questions. Pass a round to unlock the next. Take breaks between rounds, but finish all four within one day. Start as many as you like, one at a time.</p>
      </div>
      <div className="card space-y-5">
        <FieldRole form={form} set={set} />
        <div><label className="label">Company</label>
          <select className="input" value={form.company} onChange={(e) => set({ company: e.target.value })}>{catalog.companies.map((c) => <option key={c}>{c}</option>)}</select>
          <p className="mt-1 text-xs text-slate-400">Company-style practice questions. Not affiliated with any company.</p>
        </div>
        <RULES counts={{ screening: 3, technical: 3, behavioural: 3, hr: 3 }} />
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full" onClick={start} disabled={busy || !form.role}>{busy ? 'Preparing your interview…' : 'Start mock interview'}</button>
      </div>
    </div>
  )
}
