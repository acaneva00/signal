'use client'

import { Card } from '@/components/ui/card'
import type { ProjectionSummary } from '@/types/agent'
import { formatCurrencyFull } from '@/lib/canvas/format'

interface Props {
  summary: ProjectionSummary
  assumptions: string[]
}

export function ProjectionSummaryCard({ summary, assumptions }: Props) {
  return (
    <Card className="p-4 mt-3 space-y-3 bg-white border border-slate-200">
      <div className="grid grid-cols-2 gap-3">
        <Metric
          label="Super at retirement"
          value={formatCurrencyFull(summary.final_super)}
        />
        <Metric
          label="Depletion age"
          value={
            summary.depletion_age
              ? `Age ${summary.depletion_age}`
              : 'Lasts beyond age 90'
          }
          positive={!summary.depletion_age}
        />
        <Metric
          label="Total pension received"
          value={formatCurrencyFull(summary.total_pension)}
        />
        <Metric
          label="Net worth growth"
          value={formatCurrencyFull(summary.net_worth_growth)}
          positive={summary.net_worth_growth >= 0}
        />
      </div>

      {assumptions.length > 0 && (
        <div className="pt-2 border-t border-slate-100">
          <p className="text-xs font-medium text-slate-500 mb-1">Assumptions</p>
          <ul className="space-y-0.5">
            {assumptions.map((a, i) => (
              <li key={i} className="text-xs text-slate-500 flex gap-1.5">
                <span className="text-slate-400 shrink-0">•</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  )
}

function Metric({
  label,
  value,
  positive,
}: {
  label: string
  value: string
  positive?: boolean
}) {
  return (
    <div>
      <p className="text-xs text-slate-500">{label}</p>
      <p
        className={`text-sm font-semibold ${
          positive === true
            ? 'text-green-700'
            : positive === false
              ? 'text-red-600'
              : 'text-slate-900'
        }`}
      >
        {value}
      </p>
    </div>
  )
}
