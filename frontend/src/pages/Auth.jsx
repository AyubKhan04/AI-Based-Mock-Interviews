import { useRef, useState } from 'react'
import { Link, Navigate, useSearchParams } from 'react-router-dom'
import { api, token } from '../api'
import { useApp } from '../App'

export async function startGuest(setUser) {
  const r = await api('/auth/guest', { method: 'POST' })
  token.set(r.token)
  setUser(r.user)
}

export default function Auth() {
  const { user, setUser } = useApp()
  const dest = useRef('/')
  const [params] = useSearchParams()
  const [signup, setSignup] = useState(params.get('signup') === '1')
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '' })
  const [show, setShow] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault(); setErr('')
    if (signup && form.password !== form.confirm) return setErr('The two passwords do not match.')
    setBusy(true)
    try {
      const body = signup ? { name: form.name, email: form.email, password: form.password } : { email: form.email, password: form.password }
      const r = await api(signup ? '/auth/signup' : '/auth/login', { method: 'POST', body })
      token.set(r.token)
      dest.current = signup ? '/profile?welcome=1' : '/'
      setUser(r.user)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  async function guest() {
    setBusy(true); setErr('')
    try { dest.current = '/practice'; await startGuest(setUser) } catch (e) { setErr(e.message); setBusy(false) }
  }

  if (user) return <Navigate to={dest.current} replace />
  return (
    <div className="mx-auto mt-6 max-w-[420px]">
      <div className="mb-7 text-center">
        <h1 className="text-[28px] font-bold">{signup ? 'Create your account' : 'Welcome back'}</h1>
        <p className="mt-1.5 text-slate-500">{signup ? 'Free forever. Your first interview is two minutes away.' : 'Log in to continue your interview practice.'}</p>
      </div>
      <form onSubmit={submit} className="card space-y-4 p-7 shadow-lift">
        {signup && <div><label className="label">Name</label><input className="input" required value={form.name} onChange={set('name')} /></div>}
        <div><label className="label">Email</label><input className="input" type="email" required value={form.email} onChange={set('email')} /></div>
        <div><label className="label" htmlFor="pw">Password {signup && <span className="text-slate-400">(8+ characters)</span>}</label>
          <PasswordInput id="pw" show={show} onToggle={() => setShow(!show)} required minLength={signup ? 8 : 1} value={form.password} onChange={set('password')}
            autoComplete={signup ? 'new-password' : 'current-password'} /></div>
        {signup && (
          <div><label className="label" htmlFor="pw2">Confirm password</label>
            <PasswordInput id="pw2" show={show} onToggle={() => setShow(!show)} required value={form.confirm} onChange={set('confirm')} autoComplete="new-password"
              invalid={form.confirm.length > 0 && form.confirm !== form.password} />
            {form.confirm.length > 0 && (form.confirm === form.password
              ? <p className="mt-1 text-sm text-emerald-600">✓ Passwords match</p>
              : <p className="mt-1 text-sm text-red-600">Passwords do not match yet</p>)}
          </div>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full" disabled={busy || (signup && form.confirm !== form.password)}>{busy ? 'Please wait…' : signup ? 'Sign up' : 'Log in'}</button>
        <p className="text-center text-sm text-slate-500">
          {signup ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" className="font-semibold text-indigo-600 hover:text-indigo-800" onClick={() => { setSignup(!signup); setErr('') }}>{signup ? 'Log in' : 'Sign up'}</button>
        </p>
        <div className="border-t border-slate-100 pt-3 text-center">
          <button type="button" className="text-sm font-medium text-slate-600 hover:text-slate-900" onClick={guest} disabled={busy}>Just looking? <span className="text-indigo-600">Try it as a guest →</span></button>
        </div>
      </form>
    </div>
  )
}

function PasswordInput({ show, onToggle, invalid, ...props }) {
  return (
    <div className="relative">
      <input {...props} type={show ? 'text' : 'password'} className={`input pr-11 ${invalid ? 'border-red-400 focus:border-red-500' : ''}`} />
      <button type="button" onClick={onToggle} aria-label={show ? 'Hide password' : 'Show password'} title={show ? 'Hide password' : 'Show password'}
        className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 hover:text-slate-700">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" />
          {show && <line x1="3" y1="3" x2="21" y2="21" />}
        </svg>
      </button>
    </div>
  )
}
