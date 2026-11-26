import { useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api, token } from '../api'
import { useApp } from '../App'

export default function Auth() {
  const { user, setUser } = useApp()
  const dest = useRef('/')
  const [signup, setSignup] = useState(true)
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true)
    try {
      const body = signup ? form : { email: form.email, password: form.password }
      const r = await api(signup ? '/auth/signup' : '/auth/login', { method: 'POST', body })
      token.set(r.token)
      dest.current = signup ? '/profile?welcome=1' : '/'
      setUser(r.user)
    } catch (e) { setErr(e.message) } finally { setBusy(false) }
  }

  if (user) return <Navigate to={dest.current} replace />
  return (
    <div className="mx-auto mt-10 max-w-md">
      <h1 className="mb-1 text-center text-3xl font-bold text-indigo-700">Mock Interview Coach</h1>
      <p className="mb-6 text-center text-slate-500">Practise interviews with an AI interviewer that scores you and tells you how to improve.</p>
      <form onSubmit={submit} className="card space-y-4">
        <h2 className="text-xl font-semibold">{signup ? 'Create your account' : 'Welcome back'}</h2>
        {signup && <div><label className="label">Name</label><input className="input" required value={form.name} onChange={set('name')} /></div>}
        <div><label className="label">Email</label><input className="input" type="email" required value={form.email} onChange={set('email')} /></div>
        <div><label className="label">Password {signup && <span className="text-slate-400">(8+ characters)</span>}</label>
          <input className="input" type="password" required minLength={signup ? 8 : 1} value={form.password} onChange={set('password')} /></div>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? 'Please wait…' : signup ? 'Sign up' : 'Log in'}</button>
        <p className="text-center text-sm text-slate-500">
          {signup ? 'Already have an account?' : 'New here?'}{' '}
          <button type="button" className="text-indigo-600 hover:underline" onClick={() => setSignup(!signup)}>{signup ? 'Log in' : 'Sign up'}</button>
        </p>
      </form>
    </div>
  )
}
