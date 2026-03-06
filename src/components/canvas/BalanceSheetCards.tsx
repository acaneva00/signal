'use client'

import { Card } from '@/components/ui/card'
import type { ProjectionSummary } from '@/types/agent'
import { formatCurrencyFull } from '@/lib/canvas/format'

interface Props {
  summary: ProjectionSummary
}

export function BalanceSheetCards({ summary }: Props) {
  const { opening_position: open, closing_position: close } = summary

  return (
    <div className="w-full space-y-3">
      <h3 className="text-sm font-semibold text-slate-700">Balance Sheet</h3>

      <div className="grid grid-cols-2 gap-3">
        <PositionCard title="Opening" position={open} />
        <PositionCard title="Closing" position={close} />
      </div>

      <Card className="p-3 bg-slate-50 border-slate-200">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Net Worth Change</span>
          <span
            className={`text-sm font-bold ${
              summary.net_worth_growth >= 0 ? 'text-green-700' : 'text-red-600'
            }`}
          >
            {summary.net_worth_growth >= 0 ? '+' : ''}
            {formatCurrencyFull(summary.net_worth_growth)}
          </span>
        </div>
      </Card>

      {summary.milestones.length > 0 && (
        <div>
          <p className="text-xs font-medium text-slate-500 mb-1.5">Milestones</p>
          <div className="space-y-1">
            {summary.milestones.map((m, i) => (
              <div key={i} className="flex items-start gap-2 text-xs text-slate-600">
                <span className="shrink-0 w-14 text-slate-400">
                  {m.month}/{m.year}
                </span>
                <span>{m.event}</span>
                {m.amount != null && (
                  <span className="ml-auto font-medium text-slate-700">
                    {formatCurrencyFull(m.amount)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PositionCard({
  title,
  position,
}: {
  title: string
  position: { net_worth: number; total_assets: number; total_super: number; total_liabilities: number }
}) {
  return (
    <Card className="p-3 space-y-2">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{title}</p>
      <Row label="Total Assets" value={position.total_assets} />
      <Row label="Super" value={position.total_super} />
      <Row label="Liabilities" value={-position.total_liabilities} negative />
      <div className="pt-1.5 border-t border-slate-100">
        <Row label="Net Worth" value={position.net_worth} bold />
      </div>
    </Card>
  )
}

function Row({
  label,
  value,
  negative,
  bold,
}: {
  label: string
  value: number
  negative?: boolean
  bold?: boolean
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`text-xs ${bold ? 'font-semibold text-slate-800' : 'text-slate-600'}`}>
        {label}
      </span>
      <span
        className={`text-xs tabular-nums ${
          bold
            ? 'font-bold text-slate-900'
            : negative
              ? 'text-red-600'
              : 'text-slate-700'
        }`}
      >
        {formatCurrencyFull(value)}
      </span>
    </div>
  )
}
