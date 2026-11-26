import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { API } from '../api'
import { Loading } from '../App'

/** Public certificate page: the link anyone (e.g. a recruiter on LinkedIn) can open to verify it. */
export default function Certificate() {
  const { code } = useParams()
  const [c, setC] = useState(null)
  const [err, setErr] = useState('')
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    fetch(`${API}/certificates/${encodeURIComponent(code)}`).then(async (r) => {
      if (!r.ok) throw new Error('This certificate could not be verified.')
      setC(await r.json())
    }).catch((e) => setErr(e.message))
  }, [code])
  if (err) return <div className="mx-auto mt-10 max-w-md card text-center"><div className="text-4xl">⚠️</div><p className="mt-2 font-semibold">{err}</p><Link className="mt-3 inline-block text-indigo-600" to="/">Go to Mock Interview Coach</Link></div>
  if (!c) return <Loading />
  const share = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(c.verify_url)}`
  async function copy() { try { await navigator.clipboard.writeText(c.verify_url); setCopied(true) } catch { /* no clipboard */ } }
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <p className="text-center text-sm font-medium text-emerald-700">✓ Verified certificate · ID {c.code}</p>
      <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
        <div className="rounded-xl border-4 border-double border-indigo-500 px-6 py-10 text-center sm:px-12">
          <div className="text-sm font-bold uppercase tracking-[0.2em] text-indigo-600">{c.issuer}</div>
          <h1 className="mt-3 font-serif text-3xl font-bold sm:text-4xl">Certificate of Completion</h1>
          <p className="mt-6 text-slate-500">This certifies that</p>
          <p className="mt-1 font-serif text-3xl font-semibold text-slate-900">{c.name}</p>
          <p className="mx-auto mt-4 max-w-lg text-slate-700">passed all four rounds of a <b>{c.mode}</b> for the role of <b>{c.role}</b> ({c.field}).</p>
          <p className="mt-5 text-2xl font-bold text-indigo-700">Overall score {c.score}/10</p>
          <p className="mt-6 text-sm text-slate-500">Issued {new Date(c.date).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}</p>
          <p className="mt-6 text-xs italic text-slate-400">{c.disclaimer}</p>
        </div>
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        <a className="btn" href={share} target="_blank" rel="noreferrer">Share on LinkedIn</a>
        <a className="btn-ghost" href={`${API}/certificates/${c.code}.pdf`}>Download PDF</a>
        <button className="btn-ghost" onClick={copy}>{copied ? '✓ Link copied' : 'Copy verify link'}</button>
      </div>
      <p className="text-center text-xs text-slate-400">On LinkedIn you can also add it under Licences & certifications, with the ID and this link.</p>
    </div>
  )
}
