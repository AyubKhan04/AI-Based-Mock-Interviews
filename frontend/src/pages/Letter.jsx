import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api'
import { Loading } from '../App'

/** A realistic practice offer or rejection letter, clearly marked as a simulation. */
export default function Letter() {
  const { id } = useParams()
  const [l, setL] = useState(null)
  const [err, setErr] = useState('')
  useEffect(() => { api(`/interviews/${id}/letter`).then(setL).catch((e) => setErr(e.message)) }, [id])
  if (err) return <p className="text-red-600">{err}</p>
  if (!l) return <Loading />
  const offer = l.kind === 'offer'
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link className="text-sm text-indigo-600 hover:underline" to={`/interview/${id}`}>← Back to the interview</Link>
        <div className="flex gap-2">
          {l.certificate && <Link className="btn-ghost text-sm" to={`/certificate/${l.certificate}`}>🎓 Certificate</Link>}
          <button className="btn-ghost text-sm" onClick={() => window.print()}>Print or save as PDF</button>
        </div>
      </div>
      <article className="relative overflow-hidden rounded-2xl bg-white p-8 shadow-sm ring-1 ring-slate-200 sm:p-10">
        <div className="pointer-events-none absolute -right-16 top-10 rotate-45 bg-amber-100 px-20 py-1 text-center text-xs font-bold tracking-widest text-amber-800">PRACTICE</div>
        <header className="mb-8 flex items-start justify-between border-b border-slate-200 pb-5">
          <div><div className="text-lg font-bold text-indigo-700">{l.issuer}</div><div className="text-xs text-slate-500">Interview practice simulation</div></div>
          <div className="pr-14 text-right text-sm text-slate-500">{new Date(l.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</div>
        </header>
        <p className="mb-1 text-sm text-slate-500">Subject</p>
        <h1 className="mb-6 text-xl font-bold">{l.subject}</h1>
        <p className="mb-4">Dear {l.to},</p>
        {l.paragraphs.map((p, i) => <p key={i} className="mb-4 leading-relaxed text-slate-700">{p}</p>)}
        <p className="mt-8">{offer ? 'Warm regards,' : 'Kind regards,'}</p>
        <p className="font-semibold">{l.signoff}</p>
        <p className="mt-10 rounded-lg bg-amber-50 p-3 text-xs text-amber-900">{l.disclaimer}</p>
      </article>
    </div>
  )
}
