import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Loading, useApp } from '../App'
import Stars from '../Stars'

export default function Dashboard() {
  const { user } = useApp()
  const [items, setItems] = useState(null)
  const [summaryOf, setSummaryOf] = useState(null)
  const [deleting, setDeleting] = useState(null)
  useEffect(() => { api('/interviews').then(setItems).catch(() => setItems([])) }, [])
  if (!items) return <Loading />

  const done = items.filter((i) => i.status === 'completed' && i.score != null)
  const avg = done.length ? (done.reduce((s, i) => s + i.score, 0) / done.length).toFixed(1) : '–'
  const best = {}
  done.filter((i) => i.mode === 'practice').forEach((i) => { best[i.round_type] = Math.max(best[i.round_type] ?? 0, i.score) })

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Hi {user.name.split(' ')[0]} 👋</h1>
          <p className="text-slate-500">{user.fields.length ? `Preparing for ${user.fields.map((f) => f.role).join(', ')}` : <Link className="text-indigo-600" to="/profile">Pick your roles in your profile</Link>}</p></div>
        <Link to="/practice" className="btn">Start a practice session</Link>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Sessions completed" value={done.length} />
        <Stat label="Average score" value={avg} />
        <Stat label="Best round" value={Object.keys(best).length ? Object.entries(best).sort((a, b) => b[1] - a[1])[0].join(': ') : '–'} />
      </div>
      <section className="card">
        <h2 className="mb-3 font-semibold">Your sessions</h2>
        {items.length === 0 ? <p className="text-slate-500">No sessions yet. Start your first practice round.</p> : (
          <table className="w-full text-left text-sm">
            <thead className="text-slate-500"><tr><th className="p-2">Date</th><th className="p-2">Role</th><th className="p-2">Type</th><th className="p-2">Company style</th><th className="p-2">Result</th><th /></tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.id} className="border-t border-slate-100">
                <td className="p-2">{new Date(i.created_at).toLocaleDateString()}</td><td className="p-2">{i.role}</td>
                <td className="p-2">{i.mode === 'practice' ? <span className="capitalize">Practice · {i.round_type}</span> : `${i.mode === 'mock' ? 'Mock' : '⭐ Perform'} · ${i.rounds_passed}/4 passed`}</td><td className="p-2">{i.company}</td>
                <td className="p-2">{i.score != null ? <Stars rating={i.rating} score={i.score} /> : <span className="text-slate-400">{i.status.replace('_', ' ')}</span>}</td>
                <td className="whitespace-nowrap p-2 text-right">
                  <Link className="text-indigo-600 hover:underline" to={i.status === 'in_progress' ? `/interview/${i.id}` : `/report/${i.id}`}>{i.status === 'in_progress' ? 'Continue' : 'Report'}</Link>
                  <button className="ml-3 text-slate-600 hover:text-slate-900 hover:underline" onClick={() => setSummaryOf(i.id)}>Summary</button>
                  <button className="ml-3 text-red-600 hover:text-red-800 hover:underline" onClick={() => setDeleting(i)} aria-label={`Delete session from ${new Date(i.created_at).toLocaleDateString()}`}>Delete</button>
                </td>
              </tr>))}</tbody>
          </table>
        )}
      </section>
      {summaryOf && <SummaryModal id={summaryOf} onClose={() => setSummaryOf(null)} />}
      {deleting && <ConfirmDelete item={deleting} onClose={() => setDeleting(null)}
        onDeleted={(id) => { setItems(items.filter((x) => x.id !== id)); setDeleting(null) }} />}
    </div>
  )
}

function Modal({ title, onClose, children }) {
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="text-xl leading-none text-slate-400 hover:text-slate-700" onClick={onClose} aria-label="Close">×</button>
        </div>
        {children}
      </div>
    </div>
  )
}

const PRI_DOT = { high: '🔴', medium: '🟠', low: '🟢' }

function SummaryModal({ id, onClose }) {
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api(`/interviews/${id}/summary`).then(setS).catch((e) => setErr(e.message)) }, [id])
  const title = s ? `${s.role} · ${s.mode === 'practice' ? 'Practice' : s.mode === 'mock' ? 'Mock' : '⭐ Perform'}` : 'Summary'
  return (
    <Modal title={title} onClose={onClose}>
      {err && <p className="text-red-600">{err}</p>}
      {!s && !err && <p className="text-slate-500">Loading…</p>}
      {s && (
        <div className="space-y-4 text-sm">
          <div className="rounded-lg bg-slate-50 p-3">
            <div className="font-medium">{s.result}</div>
            {s.score != null && <div className="mt-1"><Stars rating={s.rating} score={s.score} /></div>}
            {s.mode !== 'practice' && (
              <div className="mt-2 flex flex-wrap gap-2">{s.rounds.map((r) => (
                <span key={r.round_type} className={`rounded px-2 py-0.5 text-xs capitalize ${r.passed ? 'bg-emerald-100 text-emerald-700' : r.passed === false ? 'bg-red-100 text-red-700' : 'bg-slate-200 text-slate-600'}`}>
                  {r.round_type}{r.score != null ? ` ${r.score}` : ''}</span>))}</div>
            )}
          </div>
          {s.strengths.length > 0 && <div><h3 className="mb-1 font-semibold text-emerald-700">Strengths</h3>
            <ul className="list-disc pl-5">{s.strengths.map((x) => <li key={x.area}>{x.area} ({x.score})</li>)}</ul></div>}
          {s.improvements.length > 0 && <div><h3 className="mb-1 font-semibold">To improve</h3>
            <ul className="space-y-1">{s.improvements.map((x, k) => <li key={k}>{PRI_DOT[x.priority]} <b>{x.area}:</b> {x.tip}</li>)}</ul></div>}
          <div><h3 className="mb-1 font-semibold">Questions answered ({s.questions.length})</h3>
            {s.questions.length === 0 ? <p className="text-slate-500">None yet.</p> : (
              <ol className="space-y-1.5">{s.questions.map((q, k) => (
                <li key={k} className="flex items-start justify-between gap-3 border-t border-slate-100 pt-1.5">
                  <span>{q.is_followup && <span className="mr-1 rounded bg-indigo-50 px-1 text-xs text-indigo-700">follow-up</span>}{q.question}</span>
                  <Stars rating={q.rating} score={q.score} />
                </li>))}</ol>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Link className="btn-ghost" to={s.status === 'in_progress' ? `/interview/${s.id}` : `/report/${s.id}`}>{s.status === 'in_progress' ? 'Continue' : 'Full report'}</Link>
          </div>
        </div>
      )}
    </Modal>
  )
}

function ConfirmDelete({ item, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function del() {
    setBusy(true); setErr('')
    try { await api(`/interviews/${item.id}`, { method: 'DELETE' }); onDeleted(item.id) } catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <Modal title="Delete this session?" onClose={onClose}>
      <p className="text-sm text-slate-600">{item.role} · {new Date(item.created_at).toLocaleDateString()}. All its answers and scores will be removed for good, and it will no longer count in your progress.</p>
      {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button className="btn-ghost" onClick={onClose} disabled={busy}>Cancel</button>
        <button className="inline-flex items-center justify-center rounded-lg bg-red-600 px-4 py-2 font-medium text-white hover:bg-red-700 disabled:opacity-50" onClick={del} disabled={busy}>{busy ? 'Deleting…' : 'Delete'}</button>
      </div>
    </Modal>
  )
}

const Stat = ({ label, value }) => <div className="card"><div className="text-sm text-slate-500">{label}</div><div className="text-2xl font-bold capitalize">{value}</div></div>
