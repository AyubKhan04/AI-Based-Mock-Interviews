import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api'
import { Loading, useApp } from '../App'
import Stars from '../Stars'

export default function Dashboard() {
  const { user } = useApp()
  const [items, setItems] = useState(null)
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
                <td className="p-2 text-right"><Link className="text-indigo-600" to={i.status === 'in_progress' ? `/interview/${i.id}` : `/report/${i.id}`}>{i.status === 'in_progress' ? 'Continue' : 'Report'}</Link></td>
              </tr>))}</tbody>
          </table>
        )}
      </section>
    </div>
  )
}

const Stat = ({ label, value }) => <div className="card"><div className="text-sm text-slate-500">{label}</div><div className="text-2xl font-bold capitalize">{value}</div></div>
