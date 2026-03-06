'use client'

interface Props {
  completeness: number
}

export function ProfileCompleteness({ completeness }: Props) {
  if (completeness >= 1) return null

  const pct = Math.round(completeness * 100)
  const label =
    pct < 30 ? 'Getting started' : pct < 60 ? 'Building your profile' : 'Almost there'

  return (
    <div className="px-4 py-2 bg-white border-b border-slate-200">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-slate-500">{label}</span>
        <span className="text-xs font-medium text-slate-600">{pct}%</span>
      </div>
      <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor:
              pct < 30 ? '#F59E0B' : pct < 60 ? '#3B82F6' : '#10B981',
          }}
        />
      </div>
    </div>
  )
}
