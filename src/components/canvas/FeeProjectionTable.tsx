'use client'

import type { FundFeeProjection } from '@/types/agent'
import { formatCurrencyFull } from '@/lib/canvas/format'

function fmtPct(value: number): string {
  return `${value.toFixed(2)}%`
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '\u2026' : str
}

interface Props {
  projections: FundFeeProjection[]
}

const thStyle: React.CSSProperties = {
  padding: '6px 10px',
  textAlign: 'right',
  color: 'var(--color-text-muted)',
  fontWeight: 600,
  fontSize: 11,
  whiteSpace: 'nowrap',
}

const tdStyle: React.CSSProperties = {
  padding: '5px 10px',
  color: 'var(--color-text-secondary)',
  fontSize: 11,
  fontFamily: 'var(--font-mono)',
  textAlign: 'right',
  whiteSpace: 'nowrap',
}

const stickyColStyle: React.CSSProperties = {
  position: 'sticky',
  left: 0,
  background: 'var(--color-bg-surface)',
  zIndex: 1,
}

export function FeeProjectionTable({ projections }: Props) {
  const funds = projections.filter((p) => p.rows.length > 0)
  if (funds.length === 0) return null

  const yearCount = funds[0].rows.length

  return (
    <div className="w-full">
      <h3
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          marginBottom: 8,
        }}
      >
        Year-by-Year Fee Projection
      </h3>
      <div
        style={{
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
        }}
      >
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11, minWidth: funds.length > 1 ? 800 : 500 }}>
            <thead>
              {/* Fund name group headers */}
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th
                  style={{
                    ...thStyle,
                    textAlign: 'left',
                    ...stickyColStyle,
                  }}
                  rowSpan={2}
                >
                  Year
                </th>
                {funds.map((fund) => (
                  <th
                    key={fund.fund_name}
                    colSpan={5}
                    style={{
                      ...thStyle,
                      textAlign: 'center',
                      color: 'var(--color-text-secondary)',
                      borderLeft: '1px solid var(--color-border)',
                    }}
                  >
                    {truncate(fund.fund_name, 24)}
                  </th>
                ))}
              </tr>
              {/* Column sub-headers */}
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                {funds.map((fund) => (
                  <SubHeaders key={fund.fund_name} />
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from({ length: yearCount }, (_, i) => (
                <tr key={i} style={{ borderBottom: i < yearCount - 1 ? '1px solid var(--color-border)' : undefined }}>
                  <td
                    style={{
                      ...tdStyle,
                      textAlign: 'left',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      color: 'var(--color-text-muted)',
                      ...stickyColStyle,
                    }}
                  >
                    {funds[0].rows[i].year}
                  </td>
                  {funds.map((fund) => {
                    const row = fund.rows[i]
                    if (!row) return <EmptyCells key={fund.fund_name} />
                    return (
                      <RowCells
                        key={fund.fund_name}
                        adminDollar={row.admin_fee_dollar}
                        adminPct={row.admin_fee_effective_pct}
                        investmentDollar={row.investment_fee_dollar}
                        yearlyTotal={row.yearly_total}
                        cumulative={row.cumulative}
                      />
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function SubHeaders() {
  const headers = ['Admin $', 'Admin %', 'Invest $', 'Total $', 'Cumul. $']
  return (
    <>
      {headers.map((h, i) => (
        <th
          key={h}
          style={{
            ...thStyle,
            borderLeft: i === 0 ? '1px solid var(--color-border)' : undefined,
          }}
        >
          {h}
        </th>
      ))}
    </>
  )
}

function RowCells({
  adminDollar,
  adminPct,
  investmentDollar,
  yearlyTotal,
  cumulative,
}: {
  adminDollar: number
  adminPct: number
  investmentDollar: number
  yearlyTotal: number
  cumulative: number
}) {
  return (
    <>
      <td style={{ ...tdStyle, borderLeft: '1px solid var(--color-border)' }}>
        {formatCurrencyFull(adminDollar)}
      </td>
      <td style={tdStyle}>{fmtPct(adminPct)}</td>
      <td style={tdStyle}>{formatCurrencyFull(investmentDollar)}</td>
      <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
        {formatCurrencyFull(yearlyTotal)}
      </td>
      <td style={{ ...tdStyle, color: 'var(--color-text-muted)' }}>
        {formatCurrencyFull(cumulative)}
      </td>
    </>
  )
}

function EmptyCells() {
  return (
    <>
      {Array.from({ length: 5 }, (_, i) => (
        <td key={i} style={{ ...tdStyle, borderLeft: i === 0 ? '1px solid var(--color-border)' : undefined }}>&mdash;</td>
      ))}
    </>
  )
}
