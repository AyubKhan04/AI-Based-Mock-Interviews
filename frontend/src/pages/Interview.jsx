import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { Loading } from '../App'
import Stars from '../Stars'

export default function Interview() {
  const { id } = useParams()
  const nav = useNavigate()
  const [st, setSt] = useState(null)
  const [log, setLog] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const box = useRef(null)
  const note = sessionStorage.getItem(`note-${id}`)

  useEffect(() => {
    api(`/interviews/${id}`).then((s) => (s.status === 'in_progress' ? setSt(s) : nav(`/report/${id}`))).catch((e) => setErr(e.message))
  }, [id, nav])
  useEffect(() => { box.current?.focus() }, [st])

  async function submit() {
    if (!text.trim()) return
    setBusy(true); setErr('')
    try {
      const r = await api(`/interviews/${id}/answer`, { method: 'POST', body: { text } })
      setLog([...log, { q: st.question, a: text, followup: st.is_followup, score: r.last_score, rating: r.last_rating }])
      setText('')
      if (r.status !== 'in_progress') nav(`/report/${id}`)
      else setSt(r)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function endEarly() {
    try { await api(`/interviews/${id}/finish`, { method: 'POST' }); nav(`/report/${id}`) } catch (e) { setErr(e.message) }
  }

  if (err && !st) return <p className="text-red-600">{err}</p>
  if (!st) return <Loading />
  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold"><span className="capitalize">{st.round_type}</span> round · question {st.question_number} of {st.total}</h1>
        <button className="btn-ghost text-sm" onClick={endEarly} disabled={busy || log.length === 0}>End and see report</button>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${((st.question_number - 1) / st.total) * 100}%` }} /></div>
      {note && <p className="text-xs text-slate-400">{note}</p>}

      {log.map((m, i) => (
        <div key={i} className="space-y-2 opacity-80">
          <Bubble who="ai" followup={m.followup}>{m.q}</Bubble>
          <Bubble who="me">{m.a}</Bubble>
          <div className="text-right text-sm"><Stars rating={m.rating} score={m.score} /></div>
        </div>
      ))}

      <Bubble who="ai" followup={st.is_followup}>{st.question}</Bubble>
      <div className="card space-y-3">
        <textarea ref={box} className="input min-h-40" placeholder="Type your answer as you would say it…" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit() }} />
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span>{words} words · aim for about 80–200</span>
          <button className="btn" onClick={submit} disabled={busy || !text.trim()}>{busy ? 'Scoring…' : 'Submit answer'}</button>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>
    </div>
  )
}

function Bubble({ who, followup, children }) {
  const ai = who === 'ai'
  return (
    <div className={`flex ${ai ? '' : 'justify-end'}`}>
      <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 ${ai ? 'bg-white ring-1 ring-slate-200' : 'bg-indigo-600 text-white'}`}>
        {ai && <div className="mb-1 text-xs font-semibold text-indigo-600">{followup ? 'Interviewer · follow-up' : 'Interviewer'}</div>}
        {children}
      </div>
    </div>
  )
}
