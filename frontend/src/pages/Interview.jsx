import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { Loading } from '../App'
import { ROUND_LABEL } from '../FieldRole'
import CodeAnswer from '../CodeAnswer'
import Stars from '../Stars'
import { Camera, MicButton, useVoice } from '../Voice'

export default function Interview() {
  const { id } = useParams()
  const nav = useNavigate()
  const [st, setSt] = useState(null)
  const [err, setErr] = useState('')
  const [banner, setBanner] = useState(null)

  const load = useCallback(() => api(`/interviews/${id}`).then((s) => {
    if (s.mode === 'practice' && s.status !== 'in_progress') nav(`/report/${id}`)
    else setSt(s)
  }).catch((e) => setErr(e.message)), [id, nav])
  useEffect(() => { load() }, [load])

  if (err && !st) return <p className="text-red-600">{err}</p>
  if (!st) return <Loading />
  if (st.question) return <Answering st={st} setSt={setSt} id={id} onRoundDone={(r) => {
    if (r.mode === 'practice') return nav(`/report/${id}`)
    setBanner(r.rounds.find((x) => x.order === r.finished_round)); setSt(r)
  }} />
  return <Hub st={st} id={id} banner={banner} reload={load} setSt={setSt} />
}

function fmt(iso) {
  return new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

function Countdown({ to }) {
  const [, tick] = useState(0)
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t) }, [])
  const ms = new Date(to) - Date.now()
  if (ms <= 0) return <span>now</span>
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000)
  return <span>{h}h {m}m</span>
}

const STATUS = {
  locked: ['🔒 Locked', 'text-slate-400'], ready: ['Ready to start', 'text-indigo-700'], scheduled: ['Booked', 'text-indigo-700'],
  in_progress: ['In progress', 'text-amber-700'], completed: ['Done', 'text-slate-700'], missed: ['Missed', 'text-red-600'], incomplete: ['Incomplete', 'text-red-600'],
}

function Hub({ st, id, banner, setSt }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const over = st.status !== 'in_progress'
  async function start(order) {
    setErr(''); setBusy(true)
    try { setSt(await api(`/interviews/${id}/rounds/${order}/start`, { method: 'POST' })) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const title = st.mode === 'perform' ? '⭐ Perform Mock Interview' : `Mock interview · ${st.company === 'Any company' ? 'general' : st.company} style`
  const END = {
    completed: ['bg-emerald-50 text-emerald-800', '🎉 You passed all four rounds. Your final report is ready and on its way to your email.'],
    failed: ['bg-red-50 text-red-800', 'You cannot proceed to the next round this time. Your feedback report shows exactly why, and what to fix first.'],
    expired: ['bg-slate-100 text-slate-700', 'This interview ended as incomplete. You have feedback on the rounds you finished. Start a new one any time.'],
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl font-bold">{title}</h1><p className="text-slate-500">{st.role}</p></div>
        {st.mode === 'mock' && !over && st.expires_at && <p className="text-sm text-slate-600">Time left to finish: <b><Countdown to={st.expires_at} /></b></p>}
      </div>
      {banner && !over && (
        <div className="rounded-lg bg-emerald-50 p-4 text-emerald-800">
          ✅ You passed the {ROUND_LABEL[banner.round_type]} round with {banner.score}/10. You are selected for the next round.
        </div>
      )}
      {over && <div className={`rounded-lg p-4 ${END[st.status][0]}`}>{END[st.status][1]} <Link className="font-semibold underline" to={`/report/${id}`}>Open the report</Link></div>}
      <div className="space-y-3">
        {st.rounds.map((r) => {
          const [label, cls] = STATUS[r.status] || [r.status, '']
          return (
            <div key={r.order} className={`card flex flex-wrap items-center gap-4 ${r.status === 'locked' ? 'opacity-60' : ''}`}>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-indigo-50 font-bold text-indigo-700">{r.order}</div>
              <div className="min-w-40 flex-1">
                <div className="font-semibold">{ROUND_LABEL[r.round_type]} <span className="text-sm font-normal text-slate-400">· {r.questions} questions · pass {r.pass_mark}+</span></div>
                <div className={`text-sm ${cls}`}>{label}{r.status === 'scheduled' && r.scheduled_at && <> · {fmt(r.scheduled_at)}</>}</div>
              </div>
              {r.score != null && <div className="text-right"><Stars rating={r.rating} score={r.score} /><div className={`text-xs ${r.passed ? 'text-emerald-600' : 'text-red-600'}`}>{r.passed ? 'Passed' : 'Not passed'}</div></div>}
              {!over && (r.status === 'ready' || r.status === 'scheduled') && (
                <button className="btn" disabled={busy || !r.can_start} onClick={() => start(r.order)}
                  title={r.can_start ? '' : 'Opens 15 minutes before the slot'}>{r.can_start ? 'Start round' : 'Opens soon'}</button>
              )}
            </div>
          )
        })}
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      {st.rounds.some((r) => r.status === 'completed') && <Link className="btn-ghost" to={`/report/${id}`}>See feedback so far</Link>}
    </div>
  )
}

function Answering({ st, setSt, id, onRoundDone }) {
  const [log, setLog] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const box = useRef(null)
  const note = sessionStorage.getItem(`note-${id}`)
  const voice = useVoice((t) => setText((x) => (x ? x + ' ' : '') + t))
  useEffect(() => { box.current?.focus() }, [st])

  async function submit() {
    if (!text.trim()) return
    setBusy(true); setErr('')
    try {
      const vm = voice.metrics()
      const r = await api(`/interviews/${id}/answer`, { method: 'POST', body: { text, voice: vm } })
      voice.reset()
      setLog([...log, { q: st.question, a: (vm ? '🎤 ' : '') + text, followup: st.is_followup, score: r.last_score, rating: r.last_rating }])
      setText('')
      if (r.round_finished) onRoundDone(r)
      else setSt(r)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function endEarly() {
    try { await api(`/interviews/${id}/finish`, { method: 'POST' }); onRoundDone({ mode: 'practice' }) } catch (e) { setErr(e.message) }
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">{ROUND_LABEL[st.round_type]} round · question {st.question_number} of {st.total}</h1>
        <Camera defaultOn={st.round_type === 'behavioural' && st.mode !== 'practice'} />
        {st.mode === 'practice' && <button className="btn-ghost text-sm" onClick={endEarly} disabled={busy || log.length === 0}>End and see report</button>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${((st.question_number - 1) / st.total) * 100}%` }} /></div>
      {note && st.mode === 'practice' && <p className="text-xs text-slate-400">{note}</p>}

      {log.map((m, i) => (
        <div key={i} className="space-y-2 opacity-80">
          <Bubble who="ai" followup={m.followup}>{m.q}</Bubble>
          <Bubble who="me">{m.a}</Bubble>
          {st.mode === 'practice' && <div className="text-right text-sm"><Stars rating={m.rating} score={m.score} /></div>}
        </div>
      ))}

      <Bubble who="ai" followup={st.is_followup}>{st.kind === 'coding' ? <><span className="mr-1 rounded bg-amber-100 px-1.5 text-xs text-amber-800">Coding</span>{st.question}</> : st.question}</Bubble>
      {st.kind === 'coding' ? (
        <CodeAnswer id={id} st={st} onAnswered={(r, summary) => {
          setLog([...log, { q: st.question, a: summary, followup: false, score: r.last_score, rating: r.last_rating }])
          if (r.round_finished) onRoundDone(r); else setSt(r)
        }} />
      ) : <div className="card space-y-3">
        <textarea ref={box} className="input min-h-40" placeholder="Type your answer, or press 🎤 and speak it…" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit() }} />
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span className="flex items-center gap-3"><MicButton voice={voice} /> {words} words · aim for about 80–200</span>
          <button className="btn" onClick={submit} disabled={busy || !text.trim()}>{busy ? 'Scoring…' : 'Submit answer'}</button>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>}
    </div>
  )
}

export function Bubble({ who, followup, children }) {
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
