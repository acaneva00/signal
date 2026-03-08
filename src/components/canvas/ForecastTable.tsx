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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          Forecast by Financial Year
        </h3>
        {detail.length > 10 && (
          <button
            onClick={() => setExpanded(!expanded)}
            style={{
              fontSize: 11,
              fontWeight: 500,
              color: 'var(--color-accent-primary)',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {expanded ? 'Show less' : `Show all ${detail.length} years`}
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
        <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  style={{
                    padding: '8px 8px',
                    textAlign: 'left',
                    fontWeight: 600,
                    fontSize: 10,
                    color: 'var(--color-text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    whiteSpace: 'nowrap',
                    background: 'var(--color-bg-surface)',
                  }}
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
                style={{
                  background: idx % 2 === 0 ? 'var(--color-bg-base)' : 'var(--color-bg-surface)',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                {COLUMNS.map((col) => {
                  const val = row[col.key]
                  return (
                    <td
                      key={col.key}
                      style={{
                        padding: '6px 8px',
                        color: 'var(--color-text-secondary)',
                        fontFamily: col.isCurrency ? 'var(--font-mono)' : 'inherit',
                        fontVariantNumeric: 'tabular-nums',
                        whiteSpace: 'nowrap',
                      }}
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
