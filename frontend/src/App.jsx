import { createContext, useContext, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { api, token } from './api'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Interview from './pages/Interview'
import Practice from './pages/Practice'
import Profile from './pages/Profile'
import Report from './pages/Report'

const Ctx = createContext(null)
export const useApp = () => useContext(Ctx)

export default function App() {
  const [user, setUser] = useState(null)
  const [catalog, setCatalog] = useState(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    api('/catalog').then(setCatalog).catch(() => setCatalog({ error: true }))
    if (!token.get()) return setReady(true)
    api('/me').then(setUser).catch(() => token.set(null)).finally(() => setReady(true))
  }, [])

  if (!ready) return <Loading text="Waking up the server… free hosting can take up to a minute." />
  return (
    <Ctx.Provider value={{ user, setUser, catalog }}>
      {user && <Header />}
      <main className="mx-auto max-w-5xl px-4 py-6">
        {catalog?.error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">Cannot reach the server. Check VITE_API_URL, or wait a minute while it wakes up.</p>}
        <Routes>
          <Route path="/login" element={<Auth />} />
          <Route path="/" element={<Private><Dashboard /></Private>} />
          <Route path="/practice" element={<Private><Practice /></Private>} />
          <Route path="/interview/:id" element={<Private><Interview /></Private>} />
          <Route path="/report/:id" element={<Private><Report /></Private>} />
          <Route path="/profile" element={<Private><Profile /></Private>} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </Ctx.Provider>
  )
}

function Private({ children }) {
  const { user } = useApp()
  return user ? children : <Navigate to="/login" />
}

export function Loading({ text = 'Loading…' }) {
  return <div className="p-10 text-center text-slate-500">{text}</div>
}

function Header() {
  const { user, setUser } = useApp()
  const nav = useNavigate()
  const link = ({ isActive }) => `rounded-md px-3 py-1.5 text-sm ${isActive ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-2 px-4 py-3">
        <Link to="/" className="mr-3 font-bold text-indigo-700">Mock Interview Coach</Link>
        <NavLink to="/" end className={link}>Dashboard</NavLink>
        <NavLink to="/practice" className={link}>Practice</NavLink>
        <NavLink to="/profile" className={link}>Profile</NavLink>
        <span className="ml-auto rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">{user.mode === 'mock' ? 'Mock mode' : 'Practice mode'}</span>
        <button className="btn-ghost text-sm" disabled title="Coming soon: the full 4-day, 4-round interview">⭐ Perform Mock Interview <span className="ml-1 text-xs">(soon)</span></button>
        <button className="text-sm text-slate-500 hover:text-slate-800" onClick={() => { token.set(null); setUser(null); nav('/login') }}>Log out</button>
      </div>
    </header>
  )
}
