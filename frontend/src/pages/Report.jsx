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
          <h1 className="text-2xl font-bold">Feedback report</h1>
          <p className="text-slate-500">{rep.role} · {rep.company} style · {rep.difficulty} · {new Date(rep.created_at).toLocaleString()}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button className="btn-ghost" onClick={() => downloadPdf(id).catch((e) => setMsg(e.message))}>Download PDF</button>
          {catalog?.email_enabled && <button className="btn-ghost" onClick={email}>Email me the PDF</button>}
          <Link className="btn" to="/practice">Practise again</Link>
        </div>
      </div>
      {msg && <p className="text-sm text-slate-600">{msg}</p>}

      {rep.rounds.map((r) => (
        <div key={r.round_type} className="space-y-5">
          <section className="card flex flex-wrap items-center gap-6">
            <div>
              <div className="text-sm uppercase tracking-wide text-slate-400">{r.round_type} round</div>
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
              <h2 className="mb-3 font-semibold">Progress since your last {r.round_type} round</h2>
              {r.progress.length === 0 ? <p className="text-sm text-slate-500">This is your first {r.round_type} round. Do another one to see your progress here.</p> : (
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
                    <td className="max-w-xs p-2 text-slate-600">{q.answer}
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
