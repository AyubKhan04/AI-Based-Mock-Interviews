/** Coaching after an answer: STAR parts, key points missed, a model answer or outline, and speaking analysis. */
const STAR = [['situation', 'Situation'], ['task', 'Task'], ['action', 'Action'], ['result', 'Result']]

export function StarChips({ star }) {
  if (!star) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="font-semibold text-slate-600">STAR:</span>
      {STAR.map(([k, l]) => (
        <span key={k} className={`rounded-full px-2 py-0.5 ${star[k] ? 'bg-emerald-100 text-emerald-800' : 'bg-red-50 text-red-700 ring-1 ring-red-200'}`}>
          {star[k] ? '✓' : '✗'} {l}</span>
      ))}
    </div>
  )
}

/** Words, pace, fillers and pauses. Pace and pauses only exist for spoken answers. Accent is never judged. */
export function SpeechStats({ m }) {
  if (!m || m.word_count == null) return null
  const fillers = Object.entries(m.fillers || {})
  const pace = m.wpm ? (m.wpm < 110 ? ['a little slow', 'text-amber-700'] : m.wpm > 165 ? ['a little fast', 'text-amber-700'] : ['good pace', 'text-emerald-700']) : null
  const len = m.word_count < 40 ? ['short', 'text-amber-700'] : m.word_count > 250 ? ['long', 'text-amber-700'] : ['good length', 'text-emerald-700']
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
      {m.wpm && <span>🎙 <b>{m.wpm}</b> words/min · <span className={pace[1]}>{pace[0]}</span></span>}
      <span>📝 <b>{m.word_count}</b> words · <span className={len[1]}>{len[0]}</span></span>
      <span>{m.filler_count ? <>🗯 <b>{m.filler_count}</b> filler{m.filler_count > 1 ? 's' : ''} ({fillers.map(([w, n]) => `${w} ×${n}`).join(', ')})</> : <span className="text-emerald-700">✓ no filler words</span>}</span>
      {m.wpm && <span>⏸ {m.long_pauses ? <><b>{m.long_pauses}</b> long pause{m.long_pauses > 1 ? 's' : ''}</> : 'no long pauses'}</span>}
      {m.too_quiet && <span className="text-amber-700">🔈 a little quiet</span>}
    </div>
  )
}

export function ModelAnswer({ example, coaching }) {
  if (!example && !coaching?.outline) return null
  return (
    <details className="rounded-lg bg-slate-50 p-3 text-sm">
      <summary className="cursor-pointer font-medium text-indigo-700">{example ? 'See a model answer' : 'See how to structure this answer'}</summary>
      <div className="mt-2 whitespace-pre-wrap text-slate-700">{example || coaching.outline}</div>
      {example && coaching?.outline && <div className="mt-2 whitespace-pre-wrap text-xs text-slate-500"><b>Structure:</b> {coaching.outline}</div>}
    </details>
  )
}

export default function FeedbackCard({ fb, score, rating, Stars }) {
  if (!fb) return null
  const c = fb.coaching || {}
  return (
    <div className="space-y-2 rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="font-semibold text-indigo-800">Coach's feedback</span>
        {Stars && <Stars rating={rating} score={score} />}
      </div>
      {fb.went_well && <p className="text-sm"><span className="text-emerald-700">✓ </span>{fb.went_well}</p>}
      {fb.to_improve && <p className="text-sm"><span className="text-amber-700">→ </span>{fb.to_improve}</p>}
      <StarChips star={c.star} />
      {c.missing?.length > 0 && <p className="text-xs text-slate-600"><b>Points to cover:</b> {c.missing.join(', ')}</p>}
      <SpeechStats m={fb.metrics} />
      <ModelAnswer example={fb.example_answer} coaching={c} />
    </div>
  )
}
