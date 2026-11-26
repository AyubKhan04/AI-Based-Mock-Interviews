import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api, downloadPdf } from '../api'
import { Loading, useApp } from '../App'
import Stars from '../Stars'

const PRI = {
  high: { dot: '🔴', label: 'High: fix first', cls: 'bg-red-50 ring-red-200' },
  medium: { dot: '🟠', label: 'Medium', cls: 'bg-orange-50 ring-orange-200' },
  low: { dot: '🟢', label: 'Low: polish', cls: 'bg-emerald-50 ring-emerald-200' },
}
const ARROW = { up: '⬆', down: '⬇', same: '→' }

export default function Report() {
  const { id } = useParams()
  const { catalog } = useApp()
  const [rep, setRep] = useState(null)
  const [msg, setMsg] = useState('')
  useEffect(() => { api(`/interviews/${id}/report`).then(setRep).catch((e) => setMsg(e.message)) }, [id])
  if (!rep) return msg ? <p className="text-red-600">{msg}</p> : <Loading />

  async function email() {
    setMsg('Sending…')
    try { await api(`/interviews/${id}/email`, { method: 'POST' }); setMsg('Sent to your email.') } catch (e) { setMsg(e.message) }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{rep.mode === 'practice' ? 'Feedback report' : rep.final?.complete ? 'Final report' : 'Interview report'}</h1>
          <p className="text-slate-500">{rep.role} · {rep.mode === 'perform' ? 'Perform Mock Interview' : `${rep.company} style`}{rep.mode === 'mock' && ' · Mock mode'} · {new Date(rep.created_at).toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => downloadPdf(id).catch((e) => setMsg(e.message))}>Download PDF</button>
          <button className="btn-ghost" onClick={() => downloadPdf(id, 'xlsx').catch((e) => setMsg(e.message))}>Download Excel</button>
          {catalog?.email_enabled && <button className="btn-ghost" onClick={email}>Email me the report</button>}
          <Link className="btn" to="/practice">Practise again</Link>
        </div>
      </div>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}

      {rep.final && <Final f={rep.final} />}

      {rep.rounds.filter((r) => r.questions.length).map((r) => (
        <div key={r.order} className="space-y-5">
          <section className="card flex flex-wrap items-center gap-6">
            <div>
              <div className="text-sm uppercase tracking-wide text-slate-400">{r.label || r.round_type} round
                {r.passed != null && <span className={`ml-2 rounded px-1.5 py-0.5 text-xs normal-case ${r.passed ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>{r.passed ? 'Passed' : `Not passed · pass mark ${r.pass_mark}`}</span>}
                {r.status === 'incomplete' && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-xs normal-case">Incomplete, not scored</span>}</div>
              <div className="text-5xl font-bold text-indigo-700">{r.score ?? '–'}<span className="text-2xl text-slate-400">/10</span></div>
              <Stars rating={r.rating} />
              <p className="mt-1 text-sm text-slate-500">{r.rating.meaning}</p>
            </div>
            <div className="min-w-64 flex-1 space-y-2">
              {r.subscores.map((s) => (
                <div key={s.key}>
                  <div className="flex justify-between text-sm"><span>{s.label}</span><span className="font-medium">{s.score}</span></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className="h-full rounded-full bg-indigo-500" style={{ width: `${s.score * 10}%` }} /></div>
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-5 md:grid-cols-2">
            <div className="card">
              <h2 className="mb-3 font-semibold">Improvements, most important first</h2>
              <ul className="space-y-2">
                {r.improvements.map((i, k) => (
                  <li key={k} className={`rounded-lg p-3 text-sm ring-1 ${PRI[i.priority].cls}`}>
                    <div className="font-medium">{PRI[i.priority].dot} {PRI[i.priority].label} · {i.area}</div>
                    <div>{i.tip}</div>
                  </li>
                ))}
              </ul>
            </div>
            <div className="card">
              <h2 className="mb-3 font-semibold">Progress since your last {r.label || r.round_type} round</h2>
              {r.progress.length === 0 ? <p className="text-sm text-slate-500">This is your first {r.label || r.round_type} round. Do another one to see your progress here.</p> : (
                <ul className="space-y-1 text-sm">
                  {r.progress.map((p) => (
                    <li key={p.area} className="flex justify-between"><span>{p.area}</span>
                      <span className={p.trend === 'up' ? 'text-emerald-600' : p.trend === 'down' ? 'text-red-600' : ''}>{p.before} → {p.after} {ARROW[p.trend]}</span></li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          <section className="card overflow-x-auto">
            <h2 className="mb-3 font-semibold">Question by question</h2>
            <table className="w-full text-left text-sm">
              <thead className="text-slate-500"><tr>
                <th className="p-2">#</th><th className="p-2">Question</th><th className="p-2">What you said</th><th className="p-2">Score</th>
                <th className="p-2">What went well</th><th className="p-2">How to improve</th><th className="p-2">Example answer</th>
              </tr></thead>
              <tbody>
                {r.questions.map((q) => (
                  <tr key={q.number} className="border-t border-slate-100 align-top">
                    <td className="p-2 font-medium">{q.number}</td>
                    <td className="p-2">{q.is_followup && <span className="mr-1 rounded bg-indigo-50 px-1 text-xs text-indigo-700">follow-up</span>}{q.question}</td>
                    <td className={`max-w-xs whitespace-pre-wrap p-2 text-slate-600 ${q.flags.includes("code_run_in_browser") ? "font-mono text-xs" : ""}`}>{q.answer}
                      {q.flags.includes('score_request_ignored') && <div className="mt-1 text-xs text-amber-700">A request to change the score was ignored.</div>}</td>
                    <td className="p-2"><Stars rating={q.rating} score={q.score} /></td>
                    <td className="p-2">{q.went_well}</td>
                    <td className="p-2">{q.to_improve}</td>
                    <td className="max-w-xs p-2 text-slate-600">{q.example_answer || <span className="text-slate-400">Example answers appear when the AI key is set.</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {r.questions.some((q) => q.flags.includes('rule_based')) && <p className="mt-3 text-xs text-slate-400">Some answers were scored by the built-in rules because the AI was not available.</p>}
          </section>
        </div>
      ))}
      <p className="text-xs text-slate-400">{rep.disclaimer} Tone is judged only on measurable things such as filler words and answer length. Accent and appearance are never judged.</p>
    </div>
  )
}

function Final({ f }) {
  return (
    <section className="card space-y-5 ring-2 ring-indigo-200">
      <div className="flex flex-wrap items-center gap-6">
        <div>
          <div className="text-sm uppercase tracking-wide text-slate-400">{f.complete ? 'Overall band' : 'Band so far (incomplete)'}</div>
          <div className="text-5xl font-bold text-indigo-700">{f.band}<span className="text-2xl text-slate-400">/10</span></div>
          <Stars rating={f.rating} />
        </div>
        <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3">
          {f.skills.map((s) => (
            <div key={s.skill} className="rounded-lg bg-slate-50 p-2"><div className="text-xs text-slate-500">{s.skill}</div><div className="text-lg font-semibold">{s.band}</div></div>
          ))}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div><h3 className="mb-1 font-semibold text-emerald-700">Top strengths</h3><ul className="list-disc pl-5 text-sm">{f.strengths.map((s) => <li key={s.skill}>{s.skill} ({s.band})</li>)}</ul></div>
        <div><h3 className="mb-1 font-semibold text-red-700">Top weaknesses</h3><ul className="list-disc pl-5 text-sm">{f.weaknesses.map((s) => <li key={s.skill}>{s.skill} ({s.band})</li>)}</ul></div>
      </div>
      {f.roadmap.length > 0 && (
        <div>
          <h3 className="mb-2 font-semibold">Your 7 → 10 roadmap</h3>
          <div className="space-y-3">{f.roadmap.map((r) => (
            <div key={r.skill} className="rounded-lg p-3 ring-1 ring-slate-200">
              <div className="font-medium">{r.skill} <span className="text-sm text-slate-400">now {r.from}</span></div>
              <ul className="list-disc pl-5 text-sm">{r.actions.map((a) => <li key={a}>{a}</li>)}</ul>
              {r.example && <div className="mt-2 text-sm text-slate-600"><b>Example.</b> {r.example.question}<br /><i>{r.example.answer}</i></div>}
            </div>
          ))}</div>
        </div>
      )}
      <div><h3 className="mb-1 font-semibold">Suggested practice plan</h3><ol className="list-decimal pl-5 text-sm">{f.practice_plan.map((p) => <li key={p}>{p}</li>)}</ol></div>
    </section>
  )
}
