import { useEffect, useState } from 'react'
import { api } from './api'
import { useApp } from './App'

const KEY = (id, order) => `emailAsked-${id}-${order}`
const seen = (k) => { try { return !!localStorage.getItem(k) } catch { return false } }
const remember = (k, v) => { try { localStorage.setItem(k, v) } catch { /* private window: ask again next time */ } }

/**
 * Practice and Mock don't email on their own, since the PDF and Excel are a click away.
 * After a session (or a Mock round) this pop-up asks once: "Send" or "Don't send".
 * `order` is the latest finished round, so each Mock round is asked about once.
 */
export default function EmailPrompt({ id, mode, order, label }) {
  const { user, catalog } = useApp()
  const k = KEY(id, order)
  const [open, setOpen] = useState(false)
  const [state, setState] = useState('ask') // ask | sending | sent | error
  const [msg, setMsg] = useState('')
  useEffect(() => {
    setState('ask'); setMsg('')
    setOpen(!!order && (mode === 'practice' || mode === 'mock') && catalog?.email_enabled && !!user && !user.is_guest && !seen(k))
  }, [k, mode, order, catalog?.email_enabled, user])
  useEffect(() => {
    if (!open) return undefined
    const esc = (e) => e.key === 'Escape' && skip()
    window.addEventListener('keydown', esc); return () => window.removeEventListener('keydown', esc)
  })
  if (!open) return null

  function skip() { remember(k, 'skipped'); setOpen(false) }
  async function send() {
    setState('sending')
    try {
      await api(`/interviews/${id}/email`, { method: 'POST' })
      remember(k, 'sent'); setState('sent')
    } catch (e) { setState('error'); setMsg(e.message) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div role="dialog" aria-modal="true" aria-labelledby="email-prompt-title" className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
        <div className="text-3xl">✉️</div>
        <h2 id="email-prompt-title" className="mt-2 text-lg font-semibold">Email you the feedback summary?</h2>
        {state === 'sent' ? (
          <>
            <p className="mt-2 text-slate-600">Done. It's on its way to <b>{user.email}</b>.</p>
            <div className="mt-5 flex justify-end"><button className="btn" onClick={() => setOpen(false)}>Close</button></div>
          </>
        ) : (
          <>
            <p className="mt-2 text-slate-600">
              Your {label || (mode === 'practice' ? 'practice feedback' : 'round feedback')} is ready. You can download the PDF and Excel here any time,
              or we can also send a copy to <b>{user.email}</b>.
            </p>
            {state === 'error' && <p className="mt-3 text-sm text-red-600">{msg}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <button className="btn-ghost" onClick={skip} disabled={state === 'sending'}>Don't send</button>
              <button className="btn" onClick={send} disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : state === 'error' ? 'Try again' : 'Send'}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
