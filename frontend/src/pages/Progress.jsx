import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Loading } from '../App'
import { ROUND_LABEL } from '../FieldRole'

export default function Progress() {
  const [p, setP] = useState(null)
  useEffect(() => { api('/progress').then(setP).catch(() => setP({ timeline: [], skills: [], by_round: {}, funnel: {} })) }, [])
  if (!p) return <Loading />
  if (!p.timeline.length) return (
    <div className="card text-center"><p className="mb-3 text-slate-500">Finish a round to start tracking your progress.</p><Link className="btn" to="/practice">Start practising</Link></div>
  )
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Your progress</h1>
      <section className="card">
        <h2 className="mb-1 font-semibold">Round scores over time</h2>
        <p className="mb-3 text-sm text-slate-500">Every finished round, oldest to newest. Hover a point for details.</p>
        <LineChart points={p.timeline} />
        <details className="mt-3 text-sm"><summary className="cursor-pointer text-slate-500">Show as a table</summary>
          <table className="mt-2 w-full text-left"><thead className="text-slate-500"><tr><th>Date</th><th>Mode</th><th>Round</th><th>Score</th></tr></thead>
            <tbody>{p.timeline.map((t, i) => <tr key={i} className="border-t border-slate-100"><td>{new Date(t.date).toLocaleDateString()}</td><td className="capitalize">{t.mode}</td><td>{ROUND_LABEL[t.round_type]}</td><td>{t.score}</td></tr>)}</tbody></table>
        </details>
      </section>

      <section className="card">
        <h2 className="mb-3 font-semibold">Skills: your first rounds compared with your latest</h2>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {p.skills.map((s) => (
            <div key={s.key} className="rounded-xl bg-slate-50 p-3">
              <div className="text-sm text-slate-500">{s.label}</div>
              <div className="text-2xl font-bold text-slate-800">{s.recent}</div>
              <div className="text-sm text-slate-600">{s.first} → {s.recent} <span aria-hidden>{s.change > 0 ? '⬆' : s.change < 0 ? '⬇' : '→'}</span>
                <span className="sr-only">{s.change > 0 ? 'up' : s.change < 0 ? 'down' : 'no change'}</span></div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-400">Average of your first 3 rounds compared with your last 3.</p>
      </section>

      <div className="grid gap-6 md:grid-cols-2">
        <section className="card">
          <h2 className="mb-3 font-semibold">By round</h2>
          <table className="w-full text-left text-sm"><thead className="text-slate-500"><tr><th className="py-1">Round</th><th>Done</th><th>Average</th><th>Best</th><th>Last</th></tr></thead>
            <tbody>{Object.entries(p.by_round).map(([rt, v]) => (
              <tr key={rt} className="border-t border-slate-100"><td className="py-1.5">{ROUND_LABEL[rt]}</td><td>{v.count}</td><td>{v.average}</td><td>{v.best}</td><td>{v.last}</td></tr>
            ))}</tbody></table>
        </section>
        <section className="card">
          <h2 className="mb-3 font-semibold">How far you get in full interviews</h2>
          {['mock', 'perform'].map((m) => p.funnel[m]?.started ? (
            <div key={m} className="mb-3">
              <div className="mb-1 text-sm font-medium">{m === 'mock' ? 'Mock interviews' : '⭐ Perform Mock Interview'} · {p.funnel[m].started} started</div>
              {p.funnel[m].passed.map((n, i) => (
                <div key={i} className="mb-1 flex items-center gap-2 text-sm">
                  <span className="w-24 text-slate-500">Passed {['Screening', 'Technical', 'Behavioural', 'HR'][i]}</span>
                  <div className="h-3 flex-1 rounded bg-slate-100"><div className="h-3 rounded bg-indigo-500" style={{ width: `${(n / p.funnel[m].started) * 100}%` }} /></div>
                  <span className="w-6 text-right">{n}</span>
                </div>
              ))}
            </div>
          ) : null)}
          {!p.funnel.mock?.started && !p.funnel.perform?.started && <p className="text-sm text-slate-500">Take a Mock interview to see this.</p>}
        </section>
      </div>
    </div>
  )
}

/** Single-series line chart: 2px line, 8px markers, recessive grid, hover tooltip. */
function LineChart({ points }) {
  const [hover, setHover] = useState(null)
  const W = 720, H = 240, L = 32, R = 12, T = 12, B = 28
  const x = (i) => L + (points.length === 1 ? (W - L - R) / 2 : (i * (W - L - R)) / (points.length - 1))
  const y = (v) => T + (1 - v / 10) * (H - T - B)
  const d = points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.score)}`).join(' ')
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Round scores over time">
        {[0, 2, 4, 6, 8, 10].map((g) => (
          <g key={g}><line x1={L} x2={W - R} y1={y(g)} y2={y(g)} stroke="var(--chart-grid)" strokeWidth="1" />
            <text x={L - 8} y={y(g) + 4} textAnchor="end" fontSize="11" fill="var(--chart-label)">{g}</text></g>
        ))}
        <path d={d} fill="none" stroke="var(--chart-line)" strokeWidth="2" strokeLinejoin="round" />
        {points.map((p, i) => (
          <g key={i} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
            <circle cx={x(i)} cy={y(p.score)} r="12" fill="transparent" />
            <circle cx={x(i)} cy={y(p.score)} r={hover === i ? 6 : 4} fill="var(--chart-line)" stroke="var(--chart-dot-ring)" strokeWidth="2" />
          </g>
        ))}
      </svg>
      {hover != null && (
        <div className="pointer-events-none absolute rounded-lg bg-slate-900 px-2 py-1 text-xs text-white shadow"
          style={{ left: `${(x(hover) / W) * 100}%`, top: `${(y(points[hover].score) / H) * 100}%`, transform: 'translate(-50%, -130%)' }}>
          {ROUND_LABEL[points[hover].round_type]} · {points[hover].score}/10<br />{new Date(points[hover].date).toLocaleDateString()} · {points[hover].mode}
        </div>
      )}
    </div>
  )
}
