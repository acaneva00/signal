'use client'

import { useState } from 'react'
import type { ProjectionSummary, YearlyDetail } from '@/types/agent'
import { formatCurrency, formatCurrencyFull } from '@/lib/canvas/format'

interface Props {
  summary: ProjectionSummary
  intent: string | null
}

interface ColumnDef {
  key: keyof YearlyDetail
  label: string
  isCurrency: boolean
}

const SUPER_ACCUMULATION_COLUMNS: ColumnDef[] = [
  { key: 'financial_year', label: 'FY', isCurrency: false },
  { key: 'age', label: 'Age', isCurrency: false },
  { key: 'opening_super_balance', label: 'Opening Super', isCurrency: true },
  { key: 'sg_contributions', label: 'SG (post-tax)', isCurrency: true },
  { key: 'voluntary_contributions', label: 'Voluntary (post-tax)', isCurrency: true },
  { key: 'investment_return', label: 'Investment Return', isCurrency: true },
  { key: 'fees', label: 'Fees', isCurrency: true },
  { key: 'super_balance', label: 'Closing Super', isCurrency: true },
]

const SUPER_LONGEVITY_COLUMNS: ColumnDef[] = [
  { key: 'financial_year', label: 'FY', isCurrency: false },
  { key: 'age', label: 'Age', isCurrency: false },
  { key: 'opening_super_balance', label: 'Opening Super', isCurrency: true },
  { key: 'sg_contributions', label: 'SG (post-tax)', isCurrency: true },
  { key: 'voluntary_contributions', label: 'Voluntary (post-tax)', isCurrency: true },
  { key: 'investment_return', label: 'Investment Return', isCurrency: true },
  { key: 'fees', label: 'Fees', isCurrency: true },
  { key: 'pension_drawdown', label: 'Pension Drawdown', isCurrency: true },
  { key: 'lump_sum_withdrawals', label: 'Lump Sum', isCurrency: true },
  { key: 'super_balance', label: 'Closing Super', isCurrency: true },
]

const INCOME_TAX_COLUMNS: ColumnDef[] = [
  { key: 'financial_year', label: 'FY', isCurrency: false },
  { key: 'age', label: 'Age', isCurrency: false },
  { key: 'gross_income', label: 'Gross Income', isCurrency: true },
  { key: 'tax', label: 'Income Tax', isCurrency: true },
  { key: 'medicare_levy', label: 'Medicare Levy', isCurrency: true },
  { key: 'hecs_repayment', label: 'HELP Repayment', isCurrency: true },
  { key: 'net_income', label: 'Net Income', isCurrency: true },
]

const NET_WORTH_COLUMNS: ColumnDef[] = [
  { key: 'financial_year', label: 'FY', isCurrency: false },
  { key: 'age', label: 'Age', isCurrency: false },
  { key: 'gross_income', label: 'Gross Income', isCurrency: true },
  { key: 'net_income', label: 'Net Income', isCurrency: true },
  { key: 'expenses', label: 'Expenses', isCurrency: true },
  { key: 'net_cash_flow', label: 'Cash Flow', isCurrency: true },
  { key: 'super_balance', label: 'Super', isCurrency: true },
  { key: 'total_assets', label: 'Other Assets', isCurrency: true },
  { key: 'total_liabilities', label: 'Liabilities', isCurrency: true },
  { key: 'net_worth', label: 'Net Worth', isCurrency: true },
]

const DEFAULT_COLUMNS: ColumnDef[] = [
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

function getColumnSet(intent: string | null): ColumnDef[] {
  if (['super_longevity', 'compare_super_longevity'].includes(intent ?? '')) return SUPER_LONGEVITY_COLUMNS
  if (['super_at_age', 'compare_retirement_age', 'fee_impact', 'compare_super_projection'].includes(intent ?? ''))
    return SUPER_ACCUMULATION_COLUMNS
  if (intent === 'take_home_pay') return INCOME_TAX_COLUMNS
  if (intent === 'household_net_worth') return NET_WORTH_COLUMNS
  return DEFAULT_COLUMNS
}

function getTableHeading(intent: string | null): string {
  if (['super_longevity', 'compare_super_longevity'].includes(intent ?? '')) return 'Retirement Drawdown by Financial Year'
  if (['super_at_age', 'compare_retirement_age', 'fee_impact', 'compare_super_projection'].includes(intent ?? ''))
    return 'Super Balance Breakdown by Financial Year'
  if (intent === 'take_home_pay') return 'Income & Tax by Financial Year'
  if (intent === 'household_net_worth') return 'Net Worth Projection by Financial Year'
  return 'Forecast by Financial Year'
}

export function ForecastTable({ summary, intent }: Props) {
  const [expanded, setExpanded] = useState(false)
  const detail = summary.yearly_detail

  if (detail.length === 0) return null

  const rows = expanded ? detail : detail.slice(0, 10)
  const columns = getColumnSet(intent)
  const heading = getTableHeading(intent)

  return (
    <div className="w-full">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
          {heading}
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
              {columns.map((col) => (
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
                {columns.map((col) => {
                  const val = row[col.key]
                  const isNull = val === null || val === undefined
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
                      title={col.isCurrency && !isNull ? formatCurrencyFull(val as number) : undefined}
                    >
                      {isNull ? '—' : col.isCurrency ? formatCurrency(val as number) : val}
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
