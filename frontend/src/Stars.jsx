export default function Stars({ rating, score }) {
  if (!rating) return null
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap" title={rating.meaning}>
      <span className="text-amber-500">{'★'.repeat(rating.stars)}<span className="text-slate-300">{'★'.repeat(5 - rating.stars)}</span></span>
      {score != null && <span className="font-semibold">{score}/10</span>}
      <span className="text-sm text-slate-500">{rating.label}</span>
    </span>
  )
}
