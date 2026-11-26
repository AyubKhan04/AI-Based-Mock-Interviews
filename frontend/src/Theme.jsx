import { useEffect, useState } from 'react'

const media = () => window.matchMedia('(prefers-color-scheme: dark)')
const saved = () => { try { return localStorage.getItem('theme') } catch { return null } }
function apply(dark) {
  document.documentElement.classList.toggle('dark', dark)
  document.documentElement.style.colorScheme = dark ? 'dark' : 'light'
}

/** Light or dark. Starts from the system setting; once you pick one, it is remembered. */
export default function ThemeToggle({ className = '' }) {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'))
  useEffect(() => {  // follow the system while the user hasn't chosen
    const m = media()
    const on = (e) => { if (!saved()) { apply(e.matches); setDark(e.matches) } }
    m.addEventListener('change', on)
    return () => m.removeEventListener('change', on)
  }, [])
  function toggle() {
    const d = !dark
    apply(d); setDark(d)
    try { localStorage.setItem('theme', d ? 'dark' : 'light') } catch { /* private mode */ }
  }
  return (
    <button type="button" onClick={toggle} className={`rounded-md px-2 py-1.5 text-base hover:bg-slate-100 ${className}`}
      aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'} title={dark ? 'Light mode' : 'Dark mode'}>
      {dark ? '☀️' : '🌙'}
    </button>
  )
}
