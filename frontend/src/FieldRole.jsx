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

export const KIND_LABEL = { coding: 'Coding', roleplay: 'Role-play', case: 'Case', scenario: 'Scenario' }

/** The field's own round names, question mix and pass marks, from /catalog. */
export function fieldRounds(catalog, field) {
  const f = catalog?.fields?.find((x) => x.key === field) || catalog?.fields?.[0]
  return f?.rounds || (catalog?.rounds || []).map((type) => ({ type, label: ROUND_LABEL[type], pass_mark: catalog.pass_marks?.[type], full: '12', mock: '3' }))
}

export const roundName = (r) => r?.label || ROUND_LABEL[r?.round_type] || r?.round_type
