import { Link } from 'react-router-dom'

/** The brand mark: a speech bubble with a tick. Same drawing as public/favicon.svg. */
export function Logo({ to = '/', small = false }) {
  return (
    <Link to={to} className="flex items-center gap-2.5 font-display text-[15px] font-bold tracking-tight text-slate-900">
      <svg width={small ? 26 : 30} height={small ? 26 : 30} viewBox="0 0 32 32" aria-hidden="true">
        <rect width="32" height="32" rx="8" className="fill-indigo-600" />
        <path d="M9 11.5a3.5 3.5 0 0 1 3.5-3.5h7A3.5 3.5 0 0 1 23 11.5v5a3.5 3.5 0 0 1-3.5 3.5H15l-4 3.5V20.3A3.5 3.5 0 0 1 9 16.5z" fill="#fff" />
        <path d="M13 13.8l2 2 4-4" fill="none" className="stroke-indigo-600" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span>Mock Interview <span className="text-indigo-600">Coach</span></span>
    </Link>
  )
}

/** Title block used at the top of each page. */
export function PageHeader({ eyebrow, title, sub, children }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-5">
      <div>
        {eyebrow && <div className="eyebrow mb-1.5">{eyebrow}</div>}
        <h1 className="text-[26px] font-bold leading-tight">{title}</h1>
        {sub && <p className="mt-1 text-slate-500">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

export function Footer() {
  return (
    <footer className="mt-16 border-t border-slate-200">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-xs text-slate-500">
        <span>© {new Date().getFullYear()} Mock Interview Coach · Practice only, not affiliated with any company.</span>
        <span>Your camera is never recorded or uploaded.</span>
      </div>
    </footer>
  )
}
