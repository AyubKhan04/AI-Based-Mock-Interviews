import { useEffect, useRef, useState } from 'react'
import { api } from './api'
import { preload, runPython } from './pyodide'

/** Code editor → Run (visible tests, real errors) → fix or Skip → Submit runs hidden tests. */
export default function CodeAnswer({ id, st, onAnswered }) {
  const spec = st.coding
  const [code, setCode] = useState(spec.starter)
  const [explain, setExplain] = useState('')
  const [out, setOut] = useState(null)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const runs = useRef(0)
  const started = useRef(Date.now())
  const [pyReady, setPyReady] = useState(false)

  useEffect(() => {
    setCode(spec.starter); setOut(null); setExplain(''); runs.current = 0; started.current = Date.now()
    preload().then(() => setPyReady(true)).catch((e) => setErr(e.message))
  }, [spec.starter])

  async function run() {
    setBusy('run'); setErr(''); runs.current += 1
    try { setOut(await runPython(code, spec.function, spec.visible)) } catch (e) { setErr(e.message) } finally { setBusy('') }
  }

  async function submit(skipped = false) {
    setBusy('submit'); setErr('')
    try {
      let passed = 0, total = 0
      if (!skipped) {
        const { tests } = await api(`/interviews/${id}/hidden-tests`)
        const res = await runPython(code, spec.function, tests)
        total = tests.length
        passed = res.results.filter((r) => r.ok).length
      }
      const seconds = Math.round((Date.now() - started.current) / 1000)
      const r = await api(`/interviews/${id}/answer`, { method: 'POST', body: { text: explain, code: { code, tests_passed: passed, tests_total: total, runs: runs.current, seconds, skipped } } })
      onAnswered(r, skipped ? '(skipped)' : `${explain}\n\n✓ ${passed}/${total} hidden tests passed`)
    } catch (e) { setErr(e.message) } finally { setBusy('') }
  }

  function onKey(e) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const t = e.target, s = t.selectionStart
      setCode(code.slice(0, s) + '    ' + code.slice(t.selectionEnd))
      requestAnimationFrame(() => { t.selectionStart = t.selectionEnd = s + 4 })
    }
  }

  return (
    <div className="card space-y-3">
      <div className="text-xs text-slate-500">Python 3 · runs in your browser · {pyReady ? 'ready' : 'loading Python (first time takes about 10 seconds)…'}</div>
      <textarea spellCheck={false} className="input min-h-64 bg-slate-900 font-mono text-sm text-slate-100" value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={onKey} aria-label="Code editor" />
      <div className="flex flex-wrap gap-2">
        <button className="btn-ghost" onClick={run} disabled={!!busy || !pyReady}>{busy === 'run' ? 'Running…' : '▶ Run examples'}</button>
        <span className="self-center text-xs text-slate-400">Attempts: {runs.current}</span>
      </div>
      {out && (
        <div className="space-y-1 rounded-lg bg-slate-50 p-3 font-mono text-xs">
          {out.error && <pre className="whitespace-pre-wrap text-red-700">{out.error}</pre>}
          {out.results.map((r, i) => (
            <div key={i} className={r.ok ? 'text-emerald-700' : 'text-red-700'}>
              {r.ok ? '✓' : '✗'} {spec.function}({r.args.map((a) => JSON.stringify(a)).join(', ')}) → {r.error ? <pre className="whitespace-pre-wrap">{r.error}</pre> : `${r.got}${r.ok ? '' : `, expected ${JSON.stringify(r.expected)}`}`}
            </div>
          ))}
          {out.stdout && <pre className="whitespace-pre-wrap text-slate-600">{out.stdout}</pre>}
        </div>
      )}
      <div>
        <label className="label">Explain your approach (and its time complexity)</label>
        <textarea className="input min-h-20" value={explain} onChange={(e) => setExplain(e.target.value)} placeholder="I used… because… It runs in O(n) time." />
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex justify-between">
        <button className="text-sm text-slate-500 hover:text-slate-800" onClick={() => submit(true)} disabled={!!busy}>Skip this problem</button>
        <button className="btn" onClick={() => submit(false)} disabled={!!busy || !pyReady}>{busy === 'submit' ? 'Running hidden tests…' : 'Submit'}</button>
      </div>
    </div>
  )
}
