'use client'

import { useState } from 'react'
import type { ProjectionSummary } from '@/types/agent'
import { formatCurrency, formatCurrencyFull } from '@/lib/canvas/format'

interface Props {
  summary: ProjectionSummary
}

type ColumnKey =
  | 'financial_year'
  | 'age'
  | 'gross_income'
  | 'tax'
  | 'net_income'
  | 'expenses'
  | 'net_cash_flow'
  | 'super_balance'
  | 'net_worth'

const COLUMNS: { key: ColumnKey; label: string; isCurrency: boolean }[] = [
  { key: 'financial_year', label: 'FY', isCurrency: false },
  { key: 'age', label: 'Age', isCurrency: false },
  { key: 'gross_income', label: 'Gross Income', isCurrency: true },
  { key: 'tax', label: 'Tax', isCurrency: true },
  { key: 'net_income', label: 'Net Income', isCurrency: true },
  { key: 'expenses', label: 'Expenses', isCurrency: true },
  { key: 'net_cash_flow', label: 'Cash Flow', isCurrency: true },
  { key: 'super_balance', label: 'Super', isCurrency: true },
  { key: 'net_worth', label: 'Net Worth', isCurrency: true },
]

export function ForecastTable({ summary }: Props) {
  const [expanded, setExpanded] = useState(false)
  const detail = summary.yearly_detail

  if (detail.length === 0) return null

  const rows = expanded ? detail : detail.slice(0, 10)

  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-slate-700">
          Forecast by Financial Year
        </h3>
        {detail.length > 10 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs text-blue-600 hover:text-blue-700 font-medium"
          >
            {expanded ? 'Show less' : `Show all ${detail.length} years`}
          </button>
        )}
      </div>

      <div className="overflow-x-auto rounded-lg border border-slate-200">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className="px-2 py-2 text-left font-semibold text-slate-600 whitespace-nowrap"
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={row.financial_year}
                className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}
              >
                {COLUMNS.map((col) => {
                  const val = row[col.key]
                  return (
                    <td
                      key={col.key}
                      className="px-2 py-1.5 text-slate-700 tabular-nums whitespace-nowrap"
                      title={col.isCurrency ? formatCurrencyFull(val as number) : undefined}
                    >
                      {col.isCurrency ? formatCurrency(val as number) : val}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
