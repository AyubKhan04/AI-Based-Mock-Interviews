import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api'
import { useApp } from '../App'
import FieldRole, { defaultFieldRole, fieldRounds } from '../FieldRole'

export default function Practice() {
  const { user, catalog } = useApp()
  const nav = useNavigate()
  const [form, setForm] = useState(() => ({
    ...defaultFieldRole(user, catalog), company: 'Any company', round_type: 'screening', difficulty: 'medium', count: 5, kind: 'concept',
  }))
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  if (!catalog || catalog.error) return null
  const set = (patch) => setForm({ ...form, ...patch })
  const rounds = fieldRounds(catalog, form.field)
  const special = catalog.fields.find((f) => f.key === form.field)?.special_kind || { key: 'coding', label: 'coding' }
  const KINDS = { coding: 'Coding problems (Python)', roleplay: 'Role-play calls', case: 'Cases and calculations', scenario: 'Workplace scenarios' }
  const handsOn = form.round_type === 'technical' && form.kind === special.key

  async function start() {
    setErr(''); setBusy(true)
    try {
      const body = { ...form, kind: handsOn ? form.kind : 'concept' }
      if (body.kind === 'concept' && ![5, 10, 15].includes(body.count)) body.count = 5
      const r = await api('/practice', { method: 'POST', body })
      sessionStorage.setItem(`note-${r.interview_id}`, r.source_note)
      nav(`/interview/${r.interview_id}`)
    } catch (e) { setErr(e.message); setBusy(false) }
  }

  const Chips = ({ k, options, label = (x) => x }) => (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => <button key={o} type="button" onClick={() => set({ [k]: o })} className={form[k] === o ? 'btn py-1.5' : 'btn-ghost py-1.5'}>{label(o)}</button>)}
    </div>
  )

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="text-2xl font-bold">Practice mode</h1>
        <p className="text-slate-500">One round at a time. No time limit, no pass or fail, a full report after every session.</p>
      </div>
      <div className="card space-y-5">
        <FieldRole form={form} set={set} />
        <div><label className="label">Company style</label>
          <select className="input" value={form.company} onChange={(e) => set({ company: e.target.value })}>{catalog.companies.map((c) => <option key={c}>{c}</option>)}</select>
          <p className="mt-1 text-xs text-slate-400">Questions are written in the public style of the company. Not affiliated with any company.{!catalog.ai_enabled && ' Company-style questions need the AI key, so common questions are used for now.'}</p>
        </div>
        <div><label className="label">Round</label><Chips k="round_type" options={rounds.map((r) => r.type)} label={(t) => rounds.find((r) => r.type === t)?.label} /></div>
        {form.round_type === 'technical' && (
          <div><label className="label">Question type</label>
            <div className="flex gap-2">
              {[['concept', 'Concept questions'], [special.key, KINDS[special.key] || special.label]].map(([k, l]) => (
                <button key={k} type="button" onClick={() => set({ kind: k, count: k === 'concept' ? 5 : k === 'coding' ? 1 : 3 })} className={form.kind === k ? 'btn py-1.5' : 'btn-ghost py-1.5'}>{l}</button>
              ))}
            </div></div>
        )}
        <div><label className="label">Difficulty</label><Chips k="difficulty" options={catalog.difficulties} label={(d) => d[0].toUpperCase() + d.slice(1)} /></div>
        <div><label className="label">Number of questions</label><Chips k="count" options={handsOn ? (form.kind === 'coding' ? [1, 2, 3] : [1, 3, 5]) : catalog.counts} /></div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full" onClick={start} disabled={busy || !form.role}>{busy ? 'Preparing questions…' : 'Start practice'}</button>
      </div>
    </div>
  )
}
