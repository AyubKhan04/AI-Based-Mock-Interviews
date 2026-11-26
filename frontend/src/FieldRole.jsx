import { useState } from 'react'
import { PANEL, PERSONAS } from './interviewer'
import { useApp } from './App'

/** Field and role pickers shared by Practice, Mock and Perform. */
export default function FieldRole({ form, set }) {
  const { catalog } = useApp()
  const field = catalog.fields.find((f) => f.key === form.field) || catalog.fields[0]
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div><label className="label">Field</label>
        <select className="input" value={form.field} onChange={(e) => {
          const f = catalog.fields.find((x) => x.key === e.target.value)
          set({ field: f.key, role: f.roles[0] })
        }}>{catalog.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}</select></div>
      <div><label className="label">Role</label>
        <select className="input" value={form.role} onChange={(e) => set({ role: e.target.value })}>{field.roles.map((r) => <option key={r}>{r}</option>)}</select></div>
    </div>
  )
}

export function defaultFieldRole(user, catalog) {
  const f = user.fields[0]
  if (f) return { field: f.field, role: f.role }
  const first = catalog?.fields?.[0]
  return { field: first?.key || 'tech', role: first?.roles[0] || '' }
}

export const ROUND_LABEL = { screening: 'Screening', technical: 'Technical', behavioural: 'Behavioural', hr: 'HR' }

export const KIND_LABEL = { coding: 'Coding', roleplay: 'Role-play', case: 'Case', scenario: 'Scenario', reverse: 'Your questions' }

/** The field's own round names, question mix and pass marks, from /catalog. */
export function fieldRounds(catalog, field) {
  const f = catalog?.fields?.find((x) => x.key === field) || catalog?.fields?.[0]
  return f?.rounds || (catalog?.rounds || []).map((type) => ({ type, label: ROUND_LABEL[type], pass_mark: catalog.pass_marks?.[type], full: '12', mock: '3' }))
}

export const roundName = (r) => r?.label || ROUND_LABEL[r?.round_type] || r?.round_type

/** Interviewer style, panel and job description: shared by Practice, Mock and Perform. */
export function StyleOptions({ form, set }) {
  const [openJd, setOpenJd] = useState(!!form.jd)
  return (
    <div className="space-y-3">
      <div><label className="label">Interviewer style</label>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PERSONAS).map(([k, p]) => (
            <button key={k} type="button" title={p.hint} onClick={() => set({ persona: k })} className={form.persona === k ? 'btn py-1.5' : 'btn-ghost py-1.5'}>{p.label}</button>
          ))}
        </div>
        <p className="mt-1 text-xs text-slate-400">{PERSONAS[form.persona]?.hint}</p>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={!!form.panel} onChange={(e) => set({ panel: e.target.checked })} />
        Panel interview: {PANEL.map((m) => m.name).join(', ')} take turns, each with their own voice</label>
      <div>
        <button type="button" className="text-sm font-medium text-indigo-700 hover:underline" onClick={() => setOpenJd(!openJd)}>{openJd ? '▾' : '▸'} Tailor it to a job post (optional)</button>
        {openJd && <>
          <textarea className="input mt-2 min-h-28 text-sm" maxLength={20000} placeholder="Paste the job description here. The interviewer will ask about the skills and duties it lists."
            value={form.jd || ''} onChange={(e) => set({ jd: e.target.value })} />
          <p className="mt-1 text-xs text-slate-400">The same job post is only sent to the free AI once, then saved. Without the AI, questions are built from its requirements.</p>
        </>}
      </div>
    </div>
  )
}
