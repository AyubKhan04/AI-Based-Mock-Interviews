const BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8000').replace(/\/$/, '')

export const token = {
  get: () => localStorage.getItem('token'),
  set: (t) => (t ? localStorage.setItem('token', t) : localStorage.removeItem('token')),
}

export async function api(path, { method = 'GET', body, raw } = {}) {
  const headers = { 'Content-Type': 'application/json' }
  if (token.get()) headers.Authorization = `Bearer ${token.get()}`
  const res = await fetch(BASE + path, { method, headers, body: body ? JSON.stringify(body) : undefined })
  if (res.status === 401 && token.get()) { token.set(null); window.location.href = '/login' }
  if (!res.ok) {
    let msg = `Something went wrong (${res.status})`
    try { const j = await res.json(); msg = typeof j.detail === 'string' ? j.detail : j.detail?.[0]?.msg || msg } catch { /* not json */ }
    throw new Error(msg)
  }
  return raw ? res : res.json()
}

export async function downloadPdf(id, ext = 'pdf') {
  const res = await api(`/interviews/${id}/report.${ext}`, { raw: true })
  const url = URL.createObjectURL(await res.blob())
  const a = Object.assign(document.createElement('a'), { href: url, download: `interview-${id}.${ext}` })
  a.click()
  URL.revokeObjectURL(url)
}
