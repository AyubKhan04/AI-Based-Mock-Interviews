import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useApp } from '../App'
import { startGuest } from './Auth'
import { ArrowRight, Briefcase, Check, FileText, LineChart, MessageSquareText, Mic, ShieldCheck } from 'lucide-react'

const FEATURES = [
  [Mic, 'An interviewer that talks', 'A voice greets you, explains each round, asks the questions, follows up on vague answers and closes the interview, like a real panel.'],
  [FileText, 'Questions from your resume', 'Upload your resume and the interviewer asks about your own projects, internships and results.'],
  [ShieldCheck, 'Real interview conditions', 'Mock and Perform rounds run in fullscreen with your camera on. Leave the tab or switch the camera off and the clock starts.'],
  [MessageSquareText, 'Coaching after every answer', 'A STAR check, the points you missed, a model answer, and your pace and filler words when you speak.'],
  [Briefcase, 'Four career fields', 'Tech with live Python coding, Sales role-play calls, Finance cases and calculations, and HR workplace scenarios.'],
  [LineChart, 'Progress you can measure', 'Reports as PDF and Excel, a skills chart over time, daily streaks and badges to keep you practising.'],
]
const MODES = [
  ['Practice', 'One round at a time. No pass or fail, feedback after every answer.', 'Any time'],
  ['Mock', 'All four rounds in a company style, a quarter of the questions, finished within a day.', 'Same day'],
  ['Perform', 'The full interview over four days, booked in your free time with email invitations and reminders.', '4 days'],
]
const ROUNDS = [['Screening', '5+'], ['Skills round', '6+'], ['Behavioural', '7+'], ['HR', '7+']]

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
    <div className="space-y-24 pb-4">
      <section className="grid items-center gap-12 pt-6 lg:grid-cols-[1.05fr_1fr]">
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
            <span className="h-1.5 w-1.5 rounded-full bg-indigo-600" />Free to use · no card needed
          </span>
          <h1 className="mt-5 text-[44px] font-extrabold leading-[1.05] sm:text-[52px]">Walk into your next interview having already done it.</h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-slate-600">Realistic interviews with an AI interviewer that speaks, listens, scores every answer and shows you exactly what to fix next.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button className="btn px-5 py-2.5 text-[15px]" onClick={guest} disabled={busy}>{busy ? 'Setting up…' : <>Try it now as a guest<ArrowRight size={16} /></>}</button>
            <Link className="btn-ghost px-5 py-2.5 text-[15px]" to="/login?signup=1">Create a free account</Link>
          </div>
          {err && <p className="mt-3 text-sm text-red-600">{err}</p>}
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-slate-500">
            {['Works in your browser', 'Tech, Finance, Sales and HR', 'PDF and Excel reports'].map((t) => (
              <li key={t} className="flex items-center gap-1.5"><Check size={15} className="text-emerald-600" />{t}</li>
            ))}
          </ul>
        </div>
        <Preview />
      </section>

      <section>
        <div className="mx-auto max-w-2xl text-center">
          <div className="eyebrow">Why it works</div>
          <h2 className="mt-2 text-3xl font-bold">Everything a real interview throws at you</h2>
          <p className="mt-3 text-slate-600">Built around how hiring panels actually run interviews, so the real one feels familiar.</p>
        </div>
        <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200 sm:grid-cols-2 feature-grid lg:grid-cols-3">
          {FEATURES.map(([Icon, t, d]) => (
            <div key={t} className="bg-white p-6">
              <div className="icon-box"><Icon size={19} /></div>
              <h3 className="mt-4 font-semibold text-slate-900">{t}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-10 lg:grid-cols-[1fr_1.3fr] lg:items-start">
        <div>
          <div className="eyebrow">How it works</div>
          <h2 className="mt-2 text-3xl font-bold">Three ways to practise</h2>
          <p className="mt-3 text-slate-600">Start small, then take on the full interview. Every interview has four rounds, and you pass one to unlock the next.</p>
          <div className="mt-6 flex flex-wrap items-center gap-2 text-sm">
            {ROUNDS.map(([r, pass], i) => (
              <span key={r} className="flex items-center gap-2">
                <span className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-medium text-slate-700">{r} <span className="text-slate-400">· {pass}</span></span>
                {i < ROUNDS.length - 1 && <ArrowRight size={14} className="text-slate-400" />}
              </span>
            ))}
          </div>
        </div>
        <ol className="space-y-3">
          {MODES.map(([m, d, when], i) => (
            <li key={m} className="card flex items-start gap-4">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-900 font-display text-sm font-bold text-white">{i + 1}</span>
              <div className="flex-1"><div className="flex items-center justify-between gap-2"><h3 className="font-semibold text-slate-900">{m}</h3><span className="pill bg-slate-100 text-slate-600">{when}</span></div>
                <p className="mt-1 text-sm text-slate-600">{d}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="relative overflow-hidden rounded-2xl bg-slate-900 px-8 py-12 text-center">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgb(91_91_240/0.35),transparent_60%)]" />
        <div className="relative">
          <h2 className="text-3xl font-bold text-white">Your next interview starts with a practice one.</h2>
          <p className="mx-auto mt-3 max-w-xl text-slate-300">Questions are original and written in the style of companies, not affiliated with them. Your camera is never recorded.</p>
          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <button className="btn bg-white px-5 py-2.5 text-[15px] text-slate-900 hover:bg-slate-100" onClick={guest} disabled={busy}>Start practising free</button>
            <Link className="rounded-lg px-5 py-2.5 text-[15px] font-semibold text-white ring-1 ring-white/25 transition-colors hover:bg-white/10" to="/login">Log in</Link>
          </div>
        </div>
      </section>
    </div>
  )
}

/** A static picture of the product, built from the same styles as the app (no images needed). */
function Preview() {
  const bars = [['Content', 82], ['Communication', 74], ['Structure', 88]]
  return (
    <div className="relative">
      <div className="pointer-events-none absolute -inset-6 rounded-[28px] bg-[radial-gradient(circle_at_30%_20%,rgb(91_91_240/0.16),transparent_60%)]" />
      <div className="relative rounded-2xl border border-slate-200 bg-white shadow-lift">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3 text-xs">
          <span className="font-semibold text-slate-700">Behavioural round</span>
          <span className="text-slate-400">Question 3 of 12</span>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-indigo-600 text-xs font-bold text-white">AI</span>
            <div className="rounded-xl rounded-tl-sm bg-slate-100 px-4 py-2.5 text-sm text-slate-700">Tell me about a time you had to deliver results under a tight deadline.</div>
          </div>
          <div className="flex justify-end">
            <div className="max-w-[85%] rounded-xl rounded-tr-sm bg-indigo-600 px-4 py-2.5 text-sm text-white">In my internship, the monthly report took two days. I rebuilt the query and cut it to 20 minutes…</div>
          </div>
          <div className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Answer score</span>
              <span className="font-display text-2xl font-bold text-slate-900">8.2<span className="text-sm font-medium text-slate-400">/10</span></span>
            </div>
            <div className="mt-3 space-y-2">
              {bars.map(([k, v]) => (
                <div key={k} className="grid grid-cols-[110px_1fr] items-center gap-3 text-xs text-slate-500">
                  <span>{k}</span><span className="h-1.5 rounded-full bg-slate-100"><span className="block h-1.5 rounded-full bg-indigo-600" style={{ width: `${v}%` }} /></span>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {['Situation', 'Task', 'Action', 'Result'].map((t, i) => (
                <span key={t} className={`pill ${i < 3 ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700'}`}>{i < 3 ? <Check size={12} /> : '+'} {t}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
