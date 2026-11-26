import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api'
import { Loading, useApp } from '../App'
import { KIND_LABEL, roundName } from '../FieldRole'
import CodeAnswer from '../CodeAnswer'
import Stars from '../Stars'
import { Camera, MicButton, useVoice } from '../Voice'
import { BigCamera, ProctorOverlay, RulesGate, proctorSession, useProctor } from '../Proctor'
import { SpeakerControls, useSpeaker } from '../Speaker'
import { TIME_LIMIT, TIME_UP, acknowledge, closing, preface } from '../interviewer'
import FeedbackCard from '../Coaching'

export default function Interview() {
  const { id } = useParams()
  const nav = useNavigate()
  const { user } = useApp()
  const name = user?.is_guest ? '' : (user?.name || '').split(' ')[0]
  const [st, setSt] = useState(null)
  const [err, setErr] = useState('')
  const [banner, setBanner] = useState(null)
  const [gate, setGate] = useState(null) // round order waiting on the rules screen
  const [stream, setStreamState] = useState(() => proctorSession.get(id))
  const speaker = useSpeaker()

  const load = useCallback(() => api(`/interviews/${id}`).then((s) => {
    if (s.mode === 'practice' && s.status !== 'in_progress') nav(`/report/${id}`)
    else setSt(s)
  }).catch((e) => setErr(e.message)), [id, nav])
  useEffect(() => { load() }, [load])

  const setStream = (s) => { proctorSession.set(id, s); setStreamState(s) }
  const watching = !!(st?.proctored && st.question && st.status === 'in_progress' && stream)
  const setIntegrity = (res) => setSt((s) => s && { ...s, integrity: { ...s.integrity, tab: res.tab, camera: res.camera } })
  const proctor = useProctor({
    id, stream, setStream, active: watching, onUpdate: setIntegrity,
    onDisqualified: (reason) => { endProctor(); speaker.speak(`${reason} I'm sorry, this interview has ended. Your report explains what happened.`); load() },
  })
  function endProctor() { proctor.pause(); proctorSession.end(); setStreamState(null) }
  useEffect(() => () => { proctor.pause(); proctorSession.end() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (err && !st) return <p className="text-red-600">{err}</p>
  if (!st) return <Loading />

  if (gate != null) return <RulesGate integrity={st.integrity} onCancel={() => setGate(null)} onStart={async (s) => {
    const r = await api(`/interviews/${id}/rounds/${gate}/start`, { method: 'POST' })
    setStream(s); setBanner(null); setGate(null); setSt(r)
  }} />

  if (st.question && st.proctored && !stream) return <RulesGate resumed integrity={st.integrity} onStart={async (s) => {
    const res = await api(`/interviews/${id}/integrity`, { method: 'POST', body: { kind: 'tab', timed_out: false } })
    if (res.disqualified) { s.getTracks().forEach((t) => t.stop()); proctorSession.end(); return load() }
    setIntegrity(res); setStream(s)
  }} />

  if (st.question) return (
    <>
      {watching && <ProctorOverlay {...proctor} integrity={st.integrity} />}
      <Answering st={st} setSt={setSt} id={id} name={name} speaker={speaker} stream={watching ? stream : null} onRoundDone={(r) => {
        if (r.mode === 'practice') return nav(`/report/${id}`)
        if (st.proctored) endProctor()
        const done = r.rounds.find((x) => x.order === r.finished_round)
        speaker.speak(closing({ round: done, status: r.status, name }))
        setBanner(done); setSt(r)
      }} />
    </>
  )
  return <Hub st={st} id={id} banner={banner} setSt={setSt} onProctoredStart={setGate} />
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
  in_progress: ['In progress', 'text-amber-700'], completed: ['Done', 'text-slate-700'], disqualified: ['⛔ Disqualified', 'text-red-600'], missed: ['Missed', 'text-red-600'], incomplete: ['Incomplete', 'text-red-600'],
}

function Hub({ st, id, banner, setSt, onProctoredStart }) {
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const over = st.status !== 'in_progress'
  async function start(order) {
    if (st.proctored) return onProctoredStart(order)
    setErr(''); setBusy(true)
    try { setSt(await api(`/interviews/${id}/rounds/${order}/start`, { method: 'POST' })) } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }
  const title = st.mode === 'perform' ? '⭐ Perform Mock Interview' : `Mock interview · ${st.company === 'Any company' ? 'general' : st.company} style`
  const END = {
    completed: ['bg-emerald-50 text-emerald-800', '🎉 You passed all four rounds. Your final report is ready and on its way to your email.'],
    failed: ['bg-red-50 text-red-800', st.disqualified_reason ? `⛔ ${st.disqualified_reason} The interview has ended.` : 'You cannot proceed to the next round this time. Your feedback report shows exactly why, and what to fix first.'],
    expired: ['bg-slate-100 text-slate-700', 'This interview ended as incomplete. You have feedback on the rounds you finished. Start a new one any time.'],
  }
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h1 className="text-2xl font-bold">{title}</h1><p className="text-slate-500">{st.role}</p></div>
        {st.mode === 'mock' && !over && st.expires_at && <p className="text-sm text-slate-600">Time left to finish: <b><Countdown to={st.expires_at} /></b></p>}
      </div>
      {st.proctored && !over && <p className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600">🛡 Proctored: each round runs in fullscreen with your camera on. Warnings used so far: tab {st.integrity.tab}/{st.integrity.chances}, camera {st.integrity.camera}/{st.integrity.chances}.</p>}
      {banner && !over && (
        <div className="rounded-lg bg-emerald-50 p-4 text-emerald-800">
          ✅ You passed the {roundName(banner)} round with {banner.score}/10. You are selected for the next round.
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
                <div className="font-semibold">{roundName(r)} <span className="text-sm font-normal text-slate-400">· {r.questions} questions · pass {r.pass_mark}+</span></div>
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

function Answering({ st, setSt, id, name, speaker, stream, onRoundDone }) {
  const [log, setLog] = useState([])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const box = useRef(null)
  const note = sessionStorage.getItem(`note-${id}`)
  const voice = useVoice((t) => setText((x) => (x ? x + ' ' : '') + t))
  useEffect(() => { box.current?.focus() }, [st])
  const ack = useMemo(() => acknowledge(log.at(-1)?.raw, log.length), [st.question]) // eslint-disable-line react-hooks/exhaustive-deps
  const intro = useMemo(() => preface({ st, name, first: log.length === 0 }), [st.question]) // eslint-disable-line react-hooks/exhaustive-deps
  const spoken = [ack, `${intro} ${st.question}`]
  useEffect(() => { speaker.speak(spoken) }, [st.question]) // eslint-disable-line react-hooks/exhaustive-deps
  const timed = st.mode !== 'practice' && st.kind !== 'coding'

  async function submit() {
    if (!text.trim()) return
    setBusy(true); setErr('')
    try {
      const vm = voice.metrics()
      voice.stop?.(); speaker.stop()
      // A real interviewer takes a moment before the next question.
      const [r] = await Promise.all([api(`/interviews/${id}/answer`, { method: 'POST', body: { text, voice: vm } }), sleep(1200 + Math.random() * 900)])
      voice.reset()
      setLog([...log, { q: st.question, a: (vm ? '🎤 ' : '') + text, raw: text, followup: st.is_followup, score: r.last_score, rating: r.last_rating, fb: r.feedback }])
      setText('')
      if (r.round_finished) onRoundDone(r)
      else setSt(r)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function endEarly() {
    try { await api(`/interviews/${id}/finish`, { method: 'POST' }); onRoundDone({ mode: 'practice' }) } catch (e) { setErr(e.message) }
  }

  const words = text.trim() ? text.trim().split(/\s+/).length : 0
  const main = (
    <div className="space-y-4">
      {log.map((m, i) => (
        <div key={i} className="space-y-2 opacity-80">
          <Bubble who="ai" followup={m.followup}>{m.q}</Bubble>
          <Bubble who="me">{m.a}</Bubble>
          {st.mode === 'practice' && (m.fb ? <FeedbackCard fb={m.fb} score={m.score} rating={m.rating} Stars={Stars} />
            : <div className="text-right text-sm"><Stars rating={m.rating} score={m.score} /></div>)}
        </div>
      ))}
      {busy && <Bubble who="ai"><span className="inline-flex items-center gap-1 text-slate-500" aria-label="The interviewer is thinking">
        <span className="h-2 w-2 animate-bounce rounded-full bg-slate-400" /><span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:150ms]" /><span className="h-2 w-2 animate-bounce rounded-full bg-slate-400 [animation-delay:300ms]" /></span></Bubble>}

      {!busy && <Bubble who="ai" followup={st.is_followup} speaking={speaker.speaking} controls={<SpeakerControls speaker={speaker} text={spoken} />}>
        {(ack || intro) && <span className="mb-1 block text-sm italic text-slate-500">{[ack, intro].filter(Boolean).join(' ')}</span>}
        {KIND_LABEL[st.kind] ? <><span className="mr-1 rounded bg-amber-100 px-1.5 text-xs text-amber-800">{KIND_LABEL[st.kind]}</span>{st.question}</> : st.question}
      </Bubble>}
      {st.kind === 'coding' ? (
        <CodeAnswer id={id} st={st} onAnswered={(r, summary) => {
          setLog([...log, { q: st.question, a: summary, followup: false, score: r.last_score, rating: r.last_rating }])
          if (r.round_finished) onRoundDone(r); else setSt(r)
        }} />
      ) : <div className="card space-y-3">
        <textarea ref={box} className="input min-h-40" placeholder="Type your answer, or press 🎤 and speak it…" value={text} onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) submit() }} />
        <div className="flex items-center justify-between text-sm text-slate-500">
          <span className="flex flex-wrap items-center gap-3" onClickCapture={() => speaker.stop()}><MicButton voice={voice} /> {words} words · aim for about 80–200
            {timed && <AnswerTimer key={st.question} limit={TIME_LIMIT[st.kind] || 180} onTimeUp={() => speaker.speak(TIME_UP)} />}</span>
          <button className="btn" onClick={submit} disabled={busy || !text.trim()}>{busy ? 'Scoring…' : 'Submit answer'}</button>
        </div>
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>}
    </div>
  )
  return (
    <div className={`mx-auto space-y-4 ${stream ? 'max-w-6xl' : 'max-w-3xl'}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{st.round_label || roundName(st)} round · question {st.question_number} of {st.total}</h1>
        {!stream && <Camera defaultOn={st.round_type === 'behavioural' && st.mode !== 'practice'} />}
        {st.mode === 'practice' && <button className="btn-ghost text-sm" onClick={endEarly} disabled={busy || log.length === 0}>End and see report</button>}
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-indigo-500 transition-all" style={{ width: `${((st.question_number - 1) / st.total) * 100}%` }} /></div>
      {note && st.mode === 'practice' && <p className="text-xs text-slate-400">{note}</p>}
      {stream ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="order-2 lg:order-1">{main}</div>
          <aside className="order-1 space-y-2 lg:order-2 lg:sticky lg:top-4 lg:self-start">
            <BigCamera stream={stream} />
            <p className="text-xs text-slate-500">🛡 Warnings used: tab {st.integrity.tab}/{st.integrity.chances} · camera {st.integrity.camera}/{st.integrity.chances}</p>
          </aside>
        </div>
      ) : main}
    </div>
  )
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Optional per-question clock for Mock and Perform. It never submits for you; the interviewer asks you to wrap up. */
function AnswerTimer({ limit, onTimeUp }) {
  const [on, setOn] = useState(() => { try { return localStorage.getItem('answerTimer') !== 'off' } catch { return true } })
  const [left, setLeft] = useState(limit)
  const told = useRef(false)
  useEffect(() => {
    if (!on) return
    const t = setInterval(() => setLeft((x) => Math.max(0, x - 1)), 1000)
    return () => clearInterval(t)
  }, [on])
  useEffect(() => { if (on && left === 0 && !told.current) { told.current = true; onTimeUp() } }, [left, on]) // eslint-disable-line react-hooks/exhaustive-deps
  function toggle() { const v = !on; setOn(v); try { localStorage.setItem('answerTimer', v ? 'on' : 'off') } catch { /* private mode */ } }
  const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0')
  return (
    <span className="inline-flex items-center gap-1.5">
      {on && <span className={`rounded-md px-2 py-0.5 font-mono text-xs ${left === 0 ? 'bg-red-100 text-red-700' : left <= 30 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'}`}
        role="timer" aria-label={`${mm} minutes ${ss} seconds left`}>⏱ {left === 0 ? "Time's up, please wrap up" : `${mm}:${ss}`}</span>}
      <button type="button" className="text-xs text-slate-400 hover:text-slate-700 hover:underline" onClick={toggle}>{on ? 'Hide timer' : '⏱ Show timer'}</button>
    </span>
  )
}

export function Bubble({ who, followup, speaking, controls, children }) {
  const ai = who === 'ai'
  return (
    <div className={`flex ${ai ? '' : 'justify-end'}`}>
      <div className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-3 ${ai ? 'bg-white ring-1 ring-slate-200' : 'bg-indigo-600 text-white'}`}>
        {ai && <div className="mb-1 flex flex-wrap items-center text-xs font-semibold text-indigo-600">{speaking && controls ? '🗣 ' : ''}{followup ? 'Interviewer · follow-up' : 'Interviewer'}{controls}</div>}
        {children}
      </div>
    </div>
  )
}
