import { createContext, useContext, useEffect, useState } from 'react'
import { Link, Navigate, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { api, token } from './api'
import Auth from './pages/Auth'
import Dashboard from './pages/Dashboard'
import Interview from './pages/Interview'
import Landing from './pages/Landing'
import Letter from './pages/Letter'
import Certificate from './pages/Certificate'
import Mock from './pages/Mock'
import Perform from './pages/Perform'
import Practice from './pages/Practice'
import Profile from './pages/Profile'
import Progress from './pages/Progress'
import Report from './pages/Report'
import ThemeToggle from './Theme'
import { Footer, Logo } from './ui'
import { LogOut, Sparkles } from 'lucide-react'

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
      {user ? <Header /> : <PublicHeader />}
      {user?.is_guest && (
        <div className="border-b border-amber-200/70 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900">
          You're trying the app as a guest. Your progress is kept for 3 days. <Link className="font-semibold underline" to="/profile#save">Save it with a free account</Link>
        </div>
      )}
      <main className="mx-auto max-w-5xl px-6 py-8">
        {catalog?.error && <p className="mb-4 rounded-lg bg-red-50 p-3 text-red-700">Cannot reach the server. Check VITE_API_URL, or wait a minute while it wakes up.</p>}
        <Routes>
          <Route path="/login" element={<Auth />} />
          <Route path="/" element={user ? <Dashboard /> : <Landing />} />
          <Route path="/practice" element={<Private><Practice /></Private>} />
          <Route path="/mock" element={<Private><Mock /></Private>} />
          <Route path="/perform" element={<Private><Perform /></Private>} />
          <Route path="/interview/:id" element={<Private><Interview /></Private>} />
          <Route path="/report/:id" element={<Private><Report /></Private>} />
          <Route path="/profile" element={<Private><Profile /></Private>} />
          <Route path="/progress" element={<Private><Progress /></Private>} />
          <Route path="/letter/:id" element={<Private><Letter /></Private>} />
          <Route path="/certificate/:code" element={<Certificate />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
      <Footer />
    </Ctx.Provider>
  )
}

function Private({ children }) {
  const { user } = useApp()
  return user ? children : <Navigate to="/login" />
}

export function Loading({ text = 'Loading…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 p-16 text-center text-sm text-slate-500">
      <span className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-indigo-600" aria-hidden="true" />
      {text}
    </div>
  )
}

function Header() {
  const { user, setUser } = useApp()
  const nav = useNavigate()
  async function switchMode(mode) {
    if (mode === user.mode) return
    setUser(await api('/me', { method: 'PUT', body: { mode } }))
    nav(mode === 'mock' ? '/mock' : '/practice')
  }
  const link = ({ isActive }) => `relative rounded-md px-3 py-2 text-sm font-medium transition-colors ${isActive ? 'text-slate-900 after:absolute after:inset-x-3 after:-bottom-[13px] after:h-0.5 after:rounded-full after:bg-indigo-600' : 'text-slate-500 hover:text-slate-900'}`
  const initials = user.is_guest ? 'G' : user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/85 backdrop-blur supports-[backdrop-filter]:bg-white/75">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-1 px-6">
        <div className="mr-6"><Logo /></div>
        <nav className="flex items-center gap-0.5">
          <NavLink to="/" end className={link}>Dashboard</NavLink>
          <NavLink to={user.mode === 'mock' ? '/mock' : '/practice'} className={link}>{user.mode === 'mock' ? 'Mock interviews' : 'Practice'}</NavLink>
          <NavLink to="/progress" className={link}>Progress</NavLink>
          <NavLink to="/profile" className={link}>Profile</NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-slate-100 p-0.5 text-xs font-semibold" title="Switch any time">
            {['practice', 'mock'].map((m) => (
              <button key={m} onClick={() => switchMode(m)} className={`rounded-md px-2.5 py-1 transition-colors ${user.mode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-800'}`}>{m === 'mock' ? 'Mock' : 'Practice'}</button>
            ))}
          </div>
          <Link to="/perform" className="btn py-1.5"><Sparkles size={15} />Perform interview</Link>
          <div className="mx-1 h-6 w-px bg-slate-200" />
          <ThemeToggle />
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-indigo-100 text-xs font-bold text-indigo-700" title={user.is_guest ? 'Guest' : user.name}>{initials}</span>
          <button className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900" aria-label="Log out" title="Log out"
            onClick={() => { token.set(null); setUser(null); nav('/login') }}><LogOut size={17} /></button>
        </div>
      </div>
    </header>
  )
}

function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/70 bg-white/80 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-2 px-6">
        <Logo />
        <div className="ml-auto flex items-center gap-2">
          <ThemeToggle />
          <Link to="/login" className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-600 transition-colors hover:text-slate-900">Log in</Link>
          <Link to="/login?signup=1" className="btn py-1.5">Get started</Link>
        </div>
      </div>
    </header>
  )
}
