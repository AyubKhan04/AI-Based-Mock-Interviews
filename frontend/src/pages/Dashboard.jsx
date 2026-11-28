import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Loading, useApp } from '../App'
import Stars from '../Stars'
import { PageHeader } from '../ui'
import { Award, CalendarCheck, Flame, Gauge, Play, Trophy } from 'lucide-react'

export default function Dashboard() {
  const { user } = useApp()
  const [items, setItems] = useState(null)
  const [summaryOf, setSummaryOf] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [ach, setAch] = useState(null)
  useEffect(() => { api('/interviews').then(setItems).catch(() => setItems([])) }, [])
  useEffect(() => { api('/achievements').then(setAch).catch(() => {}) }, [])
  if (!items) return <Loading />

  const done = items.filter((i) => i.status === 'completed' && i.score != null)
  const avg = done.length ? (done.reduce((s, i) => s + i.score, 0) / done.length).toFixed(1) : '–'
  const best = {}
  done.filter((i) => i.mode === 'practice').forEach((i) => { best[i.round_type] = Math.max(best[i.round_type] ?? 0, i.score) })

  const hour = new Date().getHours()
  const greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const top = Object.entries(best).sort((x, y) => y[1] - x[1])[0]
  return (
    <div className="space-y-8">
      <PageHeader eyebrow="Dashboard" title={`${greet}, ${user.name.split(' ')[0]}`}
        sub={user.fields.length ? `Preparing for ${user.fields.map((f) => f.role).join(', ')}` : <Link className="text-indigo-600 hover:underline" to="/profile">Pick your target roles in your profile</Link>}>
        <Link to="/mock" className="btn-ghost">Mock interview</Link>
        <Link to="/practice" className="btn"><Play size={15} />Start practice</Link>
      </PageHeader>
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat icon={CalendarCheck} label="Sessions completed" value={done.length} hint={items.length > done.length ? `${items.length - done.length} in progress` : 'All finished'} />
        <Stat icon={Gauge} label="Average score" value={avg === '–' ? '–' : <>{avg}<span className="text-base font-medium text-slate-400">/10</span></>} hint="Across finished sessions" />
        <Stat icon={Trophy} label="Best round" value={top ? <span className="capitalize">{top[0]}</span> : '–'} hint={top ? `Scored ${top[1]}/10 in practice` : 'Finish a practice round'} />
      </div>
      {ach && <Achievements a={ach} resume={!!user.resume} />}
      <section className="card overflow-hidden p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-base font-semibold">Your sessions</h2>
          <span className="text-sm text-slate-500">{items.length} total</span>
        </div>
        {items.length === 0 ? <p className="border-t border-slate-100 px-5 py-10 text-center text-slate-500">No sessions yet. <Link className="font-medium text-indigo-600 hover:underline" to="/practice">Start your first practice round</Link>.</p> : (
          <table className="w-full text-left text-sm">
            <thead className="border-y border-slate-200 bg-slate-50"><tr><th className="px-5 py-2.5">Date</th><th className="px-3 py-2.5">Role</th><th className="px-3 py-2.5">Type</th><th className="px-3 py-2.5">Company style</th><th className="px-3 py-2.5">Result</th><th className="px-5 py-2.5"><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.id} className="border-t border-slate-100 transition-colors first:border-t-0 hover:bg-slate-50">
                <td className="whitespace-nowrap px-5 py-3 text-slate-500">{new Date(i.created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td className="px-3 py-3 font-medium text-slate-900">{i.role}</td>
                <td className="px-3 py-3">{i.mode === 'practice' ? <span className="capitalize">Practice · {i.round_label || i.round_type}</span> : `${i.mode === 'mock' ? 'Mock' : 'Perform'} · ${i.rounds_passed}/4 passed`}</td>
                <td className="px-3 py-3 text-slate-500">{i.company}</td>
                <td className="px-3 py-3">{i.score != null ? <Stars rating={i.rating} score={i.score} /> : <StatusPill status={i.status} />}</td>
                <td className="whitespace-nowrap px-5 py-3 text-right text-sm font-medium">
                  <Link className="text-indigo-600 hover:text-indigo-800" to={i.status === 'in_progress' ? `/interview/${i.id}` : `/report/${i.id}`}>{i.status === 'in_progress' ? 'Continue' : 'Report'}</Link>
                  <button className="ml-4 text-slate-500 hover:text-slate-900" onClick={() => setSummaryOf(i.id)}>Summary</button>
                  <button className="ml-4 text-slate-400 hover:text-red-600" onClick={() => setDeleting(i)} aria-label={`Delete session from ${new Date(i.created_at).toLocaleDateString()}`}>Delete</button>
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

const PRI_DOT = { high: 'bg-red-500', medium: 'bg-orange-500', low: 'bg-emerald-500' }

function SummaryModal({ id, onClose }) {
  const [s, setS] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api(`/interviews/${id}/summary`).then(setS).catch((e) => setErr(e.message)) }, [id])
  const title = s ? `${s.role} · ${s.mode === 'practice' ? 'Practice' : s.mode === 'mock' ? 'Mock' : 'Perform'}` : 'Summary'
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
                  {r.label || r.round_type}{r.score != null ? ` ${r.score}` : ''}</span>))}</div>
            )}
          </div>
          {s.strengths.length > 0 && <div><h3 className="mb-1 font-semibold text-emerald-700">Strengths</h3>
            <ul className="list-disc pl-5">{s.strengths.map((x) => <li key={x.area}>{x.area} ({x.score})</li>)}</ul></div>}
          {s.improvements.length > 0 && <div><h3 className="mb-1 font-semibold">To improve</h3>
            <ul className="space-y-1">{s.improvements.map((x, k) => <li key={k} className="flex items-baseline gap-2"><span className={`mt-1.5 h-2 w-2 shrink-0 self-start rounded-full ${PRI_DOT[x.priority]}`} /><span><b>{x.area}:</b> {x.tip}</span></li>)}</ul></div>}
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

const Stat = ({ icon: Icon, label, value, hint }) => (
  <div className="card">
    <div className="flex items-center justify-between"><span className="text-sm font-medium text-slate-500">{label}</span><span className="icon-box h-8 w-8"><Icon size={16} /></span></div>
    <div className="mt-2 font-display text-[28px] font-bold leading-none text-slate-900">{value}</div>
    <div className="mt-2 text-xs text-slate-500">{hint}</div>
  </div>
)

const PILL = { in_progress: ['bg-amber-50 text-amber-700 ring-amber-200', 'In progress'], failed: ['bg-red-50 text-red-700 ring-red-200', 'Not passed'],
  expired: ['bg-slate-100 text-slate-600 ring-slate-200', 'Incomplete'], completed: ['bg-emerald-50 text-emerald-700 ring-emerald-200', 'Completed'] }
function StatusPill({ status }) {
  const [cls, label] = PILL[status] || ['bg-slate-100 text-slate-600 ring-slate-200', status.replace('_', ' ')]
  return <span className={`pill ring-1 ring-inset ${cls}`}><span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />{label}</span>
}

function Achievements({ a, resume }) {
  const { current, best, today_done: today } = a.streak
  const got = a.badges.filter((b) => b.earned).length
  return (
    <section className="grid gap-4 md:grid-cols-[260px_1fr]">
      <div className="card flex items-center gap-4">
        <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-xl ${current ? 'bg-orange-50 text-orange-500 ring-1 ring-orange-200' : 'bg-slate-100 text-slate-400'}`} aria-hidden="true"><Flame size={28} /></div>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Daily streak</div>
          <div className="font-display text-2xl font-bold text-slate-900">{current} day{current === 1 ? '' : 's'}</div>
          <div className="text-sm text-slate-500">{today ? 'Practised today. See you tomorrow!' : current ? 'Answer one question today to keep your streak.' : 'Answer one question to start a streak.'}</div>
          <div className="text-xs text-slate-400">Best: {best} day{best === 1 ? '' : 's'}</div>
        </div>
      </div>
      <div className="card">
        <div className="mb-3 flex items-center justify-between"><h2 className="flex items-center gap-2 text-base font-semibold"><Award size={17} className="text-indigo-600" />Badges</h2><span className="text-sm text-slate-500">{got} of {a.badges.length} earned</span></div>
        <div className="flex flex-wrap gap-2">
          {a.badges.map((b) => (
            <span key={b.key} title={b.how} className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ring-1 ring-inset ${b.earned ? 'bg-amber-50 font-semibold text-amber-800 ring-amber-200' : 'bg-white text-slate-400 ring-slate-200'}`}>
              <span className={b.earned ? '' : 'opacity-50 grayscale'}>{b.icon}</span>{b.label}</span>
          ))}
        </div>
        {!resume && <p className="mt-3 text-sm text-slate-500">Tip: <Link className="text-indigo-600 hover:underline" to="/profile#resume">add your resume</Link> and the interviewer will ask about your own projects.</p>}
      </div>
    </section>
  )
}
