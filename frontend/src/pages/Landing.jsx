import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../App'
import { startGuest } from './Auth'

const FEATURES = [
  ['🗣', 'An interviewer that talks', 'A voice greets you, explains each round, asks the questions, follows up on vague answers and closes the interview, like a real panel.'],
  ['📄', 'Questions about your resume', 'Upload your resume and the interviewer asks about your own projects, internships and results.'],
  ['🛡', 'Real interview conditions', 'Mock and Perform rounds run in fullscreen with your camera on. Leave the tab or switch the camera off and the clock starts.'],
  ['⭐', 'Coaching after every answer', 'A STAR check, the points you missed, a model answer, and your pace and filler words when you speak.'],
  ['🧭', 'Four career fields', 'Tech with live Python coding, Sales role-play calls, Finance cases and calculations, and HR workplace scenarios.'],
  ['📈', 'Progress you can see', 'Reports as PDF and Excel, a skills chart, daily streaks and badges to keep you practising.'],
]
const MODES = [
  ['Practice', 'One round at a time, no pass or fail, feedback after every answer.'],
  ['Mock', 'All four rounds in a company style, a quarter of the questions, finished within a day.'],
  ['⭐ Perform', 'The full four-day interview, booked in your free time with email invitations and reminders.'],
]

export default function Landing() {
  const { setUser } = useApp()
  const nav = useNavigate()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  async function guest() {
    setBusy(true); setErr('')
    try { await startGuest(setUser); nav('/practice') } catch (e) { setErr(e.message); setBusy(false) }
  }
  return (
    <div className="space-y-14 pb-10">
      <section className="mx-auto max-w-3xl pt-10 text-center">
        <p className="mb-3 inline-block rounded-full bg-indigo-50 px-3 py-1 text-sm font-medium text-indigo-700">Free · no card · works in your browser</p>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl">Walk into your next interview having already done it.</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-slate-600">Mock Interview Coach runs realistic interviews with an AI interviewer that speaks, listens, scores every answer and shows you exactly how to improve.</p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <button className="btn px-6 py-3 text-base" onClick={guest} disabled={busy}>{busy ? 'Setting up…' : 'Try it now as a guest'}</button>
          <Link className="btn-ghost px-6 py-3 text-base" to="/login?signup=1">Create a free account</Link>
        </div>
        <p className="mt-3 text-sm text-slate-500">Already have an account? <Link className="text-indigo-600 hover:underline" to="/login">Log in</Link></p>
        {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
      </section>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {FEATURES.map(([icon, t, d]) => (
          <div key={t} className="card"><div className="text-2xl">{icon}</div><h2 className="mt-2 font-semibold">{t}</h2><p className="mt-1 text-sm text-slate-600">{d}</p></div>
        ))}
      </section>
      <section className="card">
        <h2 className="mb-4 text-xl font-bold">Three ways to practise</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {MODES.map(([m, d], i) => (
            <div key={m} className="rounded-xl bg-slate-50 p-4"><div className="text-sm text-slate-400">Step {i + 1}</div><div className="font-semibold">{m}</div><p className="mt-1 text-sm text-slate-600">{d}</p></div>
          ))}
        </div>
        <p className="mt-4 text-sm text-slate-500">Every interview has four rounds: Screening, the field's own skills round, Behavioural and HR. Pass one to unlock the next.</p>
      </section>
      <section className="text-center text-sm text-slate-500">
        Your camera is never recorded or uploaded. Practice questions are original and written "in the style of" companies, not affiliated with them.
      </section>
    </div>
  )
}
