'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { FeeBreakdownComparison, FundFeeBreakdown } from '@/types/agent'
import { formatCurrencyFull } from '@/lib/canvas/format'

const TICK_STYLE = { fontSize: 11, fill: '#8B8FA8' }
const TOOLTIP_STYLE: React.CSSProperties = {
  backgroundColor: '#16181F',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#F0F2F5',
}

const FEE_LABEL_COLORS: Record<string, string> = {
  'Administration Fee': '#4F7EF7',
  'Administration Fee (%)': '#60C4F7',
  'Administration Fee (tiered)': '#60C4F7',
  'Investment Fee': '#7B68EE',
  'Member Fee': '#34D399',
  'Advice Fee': '#F6AD55',
  'Indirect Cost Ratio': '#FC8181',
}

const FALLBACK_COLOR = '#5A5F72'

function feeColor(label: string): string {
  return FEE_LABEL_COLORS[label] ?? FALLBACK_COLOR
}

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + '…' : str
}

function formatDollarAxis(value: number): string {
  return `$${Math.round(value)}/yr`
}

interface Props {
  data: FeeBreakdownComparison
}

export function FeeBreakdownChart({ data }: Props) {
  const { funds, balance_used, projection_diff } = data
  if (funds.length === 0) return null

  const allLabels = Array.from(
    new Set(funds.flatMap((f) => f.fee_components.map((c) => c.label)))
  )

  const chartData = funds.map((fund) => {
    const entry: Record<string, string | number> = {
      name: truncate(fund.fund_name, 20),
    }
    for (const label of allLabels) {
      const comp = fund.fee_components.find((c) => c.label === label)
      entry[label] = comp ? comp.annual_dollar : 0
    }
    return entry
  })

  const basisLookup = new Map<string, Map<string, string>>()
  for (const fund of funds) {
    const fundMap = new Map<string, string>()
    for (const comp of fund.fee_components) {
      fundMap.set(comp.label, comp.basis)
    }
    basisLookup.set(fund.fund_name, fundMap)
  }

  const chartHeight = funds.length >= 3 ? 280 : 200

  return (
    <div className="w-full">
      {/* Section A — Stacked Bar Chart */}
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
        Fee Breakdown Comparison
      </h3>
      <div style={{ width: '100%', height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            layout="vertical"
            margin={{ top: 8, right: 12, left: 8, bottom: 4 }}
          >
            <XAxis
              type="number"
              tickFormatter={formatDollarAxis}
              tick={TICK_STYLE}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={TICK_STYLE}
              width={120}
            />
            <Tooltip
              contentStyle={TOOLTIP_STYLE}
              cursor={{ fill: 'rgba(255,255,255,0.04)' }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null
                const fundName = payload[0]?.payload?.name as string
                const fullFund = funds.find(
                  (f) => truncate(f.fund_name, 20) === fundName
                )
                return (
                  <div style={{
                    ...TOOLTIP_STYLE,
                    padding: '8px 12px',
                    position: 'relative' as const,
                  }}>
                    {payload.map((entry) => {
                      const label = entry.dataKey as string
                      const dollar = entry.value as number
                      if (!dollar) return null
                      const basis = fullFund
                        ? basisLookup.get(fullFund.fund_name)?.get(label) ?? ''
                        : ''
                      return (
                        <div key={label} style={{ marginBottom: 2, whiteSpace: 'nowrap' }}>
                          <span style={{ color: entry.color as string, fontWeight: 600 }}>
                            {label}
                          </span>
                          : {basis} = ${dollar.toFixed(2)}/yr
                        </div>
                      )
                    })}
                  </div>
                )
              }}
            />
            <Legend wrapperStyle={{ fontSize: '11px', color: '#8B8FA8' }} />
            {allLabels.map((label) => (
              <Bar
                key={label}
                dataKey={label}
                stackId="fees"
                fill={feeColor(label)}
                radius={0}
              />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Section B — Investment Option + Asset Allocation Cards */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginTop: 16 }}>
        {funds.map((fund) => (
          <FundCard key={fund.fund_name} fund={fund} />
        ))}
      </div>

      {/* Section C — Fee Formula Breakdown Table */}
      <div style={{
        marginTop: 16,
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
              <th style={thStyle}>Fee Type</th>
              {funds.map((f) => (
                <th key={f.fund_name} style={thStyle}>{truncate(f.fund_name, 18)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {allLabels.map((label) => (
              <tr key={label} style={{ borderBottom: '1px solid var(--color-border)' }}>
                <td style={tdStyle}>{label}</td>
                {funds.map((fund) => {
                  const comp = fund.fee_components.find((c) => c.label === label)
                  return (
                    <td key={fund.fund_name} style={{ ...tdStyle, fontFamily: 'var(--font-mono)' }}>
                      {comp ? comp.basis : '—'}
                    </td>
                  )
                })}
              </tr>
            ))}
            <tr>
              <td style={{ ...tdStyle, fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Total
              </td>
              {funds.map((fund) => (
                <td key={fund.fund_name} style={{
                  ...tdStyle,
                  fontWeight: 600,
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--color-text-secondary)',
                }}>
                  {formatCurrencyFull(fund.total_annual_fee)}/yr
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>

      {/* Section D — Projection Difference Callout */}
      {projection_diff != null && projection_diff !== 0 && (
        <div
          style={{
            marginTop: 12,
            borderRadius: 'var(--radius-md)',
            background: 'var(--color-bg-surface)',
            border: '1px solid var(--color-border)',
            padding: 12,
            textAlign: 'center',
          }}
        >
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
            Difference attributable to fees over projection
          </p>
          <p style={{
            fontSize: 20,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: projection_diff > 0
              ? 'var(--color-accent-danger)'
              : 'var(--color-accent-success)',
            margin: '4px 0',
          }}>
            {formatCurrencyFull(Math.abs(projection_diff))}
          </p>
          <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
            {projection_diff > 0
              ? `Higher fees cost you ${formatCurrencyFull(projection_diff)} over the projection`
              : `Lower fees save you ${formatCurrencyFull(Math.abs(projection_diff))} over the projection`}
          </p>
        </div>
      )}

      {/* Balance context */}
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginTop: 12, textAlign: 'center' }}>
        Fees calculated at a balance of {formatCurrencyFull(balance_used)}
      </p>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function FundCard({ fund }: { fund: FundFeeBreakdown }) {
  return (
    <div style={{
      flex: '1 1 200px',
      background: 'var(--color-bg-surface)',
      border: '1px solid var(--color-border)',
      borderRadius: 'var(--radius-md)',
      padding: 12,
    }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--color-text-secondary)', margin: 0 }}>
        {truncate(fund.fund_name, 24)}
      </p>
      <p style={{ fontSize: 11, color: '#4F7EF7', margin: '2px 0 8px' }}>
        {fund.investment_option}
      </p>

      {/* Asset allocation mini bar */}
      <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', marginBottom: 4 }}>
        <div style={{ width: `${fund.growth_pct}%`, background: '#4F7EF7' }} />
        <div style={{ width: `${fund.defensive_pct}%`, background: '#3A3D4A' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--color-text-muted)' }}>
        <span>{fund.growth_pct}% Growth</span>
        <span>{fund.defensive_pct}% Defensive</span>
      </div>

      <p style={{
        fontSize: 18,
        fontWeight: 700,
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-text-primary)',
        margin: '8px 0 0',
      }}>
        {formatCurrencyFull(fund.total_annual_fee)}/yr
      </p>
    </div>
  )
}

// ── Table Styles ────────────────────────────────────────────────────────────

const thStyle: React.CSSProperties = {
  padding: '6px 10px',
  textAlign: 'left',
  color: 'var(--color-text-muted)',
  fontWeight: 600,
  fontSize: 11,
}

const tdStyle: React.CSSProperties = {
  padding: '5px 10px',
  color: 'var(--color-text-secondary)',
  fontSize: 11,
}

// ── Sample Data ─────────────────────────────────────────────────────────────

export const SAMPLE_FEE_BREAKDOWN: FeeBreakdownComparison = {
  balance_used: 85_000,
  funds: [
    {
      fund_name: 'AustralianSuper',
      investment_option: 'Balanced (MySuper)',
      growth_pct: 75,
      defensive_pct: 25,
      total_annual_fee: 647.50,
      fee_components: [
        {
          label: 'Administration Fee',
          annual_dollar: 78,
          basis: '$78 flat',
          type: 'flat',
        },
        {
          label: 'Investment Fee',
          annual_dollar: 569.50,
          basis: '0.67% × $85,000',
          type: 'percentage',
        },
      ],
    },
    {
      fund_name: 'Aware Super',
      investment_option: 'High Growth',
      growth_pct: 85,
      defensive_pct: 15,
      total_annual_fee: 722.50,
      fee_components: [
        {
          label: 'Administration Fee',
          annual_dollar: 52,
          basis: '$52 flat',
          type: 'flat',
        },
        {
          label: 'Investment Fee',
          annual_dollar: 586.50,
          basis: '0.69% × $85,000',
          type: 'percentage',
        },
        {
          label: 'Indirect Cost Ratio',
          annual_dollar: 84,
          basis: '0.10% × $85,000',
          type: 'percentage',
        },
      ],
    },
  ],
  projection_diff: -75,
}
