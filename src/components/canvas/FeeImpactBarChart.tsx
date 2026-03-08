'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
} from 'recharts'
import type { ComparisonResult } from '@/types/agent'
import { formatCurrency, formatCurrencyFull, COLORS } from '@/lib/canvas/format'

const TICK_STYLE = { fontSize: 11, fill: '#8B8FA8' }
const TOOLTIP_STYLE = {
  backgroundColor: '#16181F',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#F0F2F5',
}

interface Props {
  comparison: ComparisonResult
}

export function FeeImpactBarChart({ comparison }: Props) {
  if (comparison.scenarios.length < 2) return null

  const data = comparison.scenarios.map((s) => ({
    name: s.scenario_name,
    final_super: Math.round(s.final_super),
  }))

  const diff = data[0].final_super - data[1].final_super

  return (
    <div className="w-full">
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
        Fee Impact on Super Balance
      </h3>
      <div className="w-full h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8B8FA8' }} />
            <YAxis tickFormatter={formatCurrency} tick={TICK_STYLE} width={60} />
            <Tooltip
              formatter={((value: number) => [formatCurrencyFull(value), 'Final Super']) as never}
              contentStyle={TOOLTIP_STYLE}
            />
            <Legend wrapperStyle={{ fontSize: '11px', color: '#8B8FA8' }} />
            <Bar dataKey="final_super" name="Final Super Balance" radius={[4, 4, 0, 0]}>
              {data.map((_, idx) => (
                <Cell
                  key={idx}
                  fill={idx === 0 ? COLORS.navy : COLORS.accent}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

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
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>Difference attributable to fees</p>
        <p style={{
          fontSize: 20,
          fontWeight: 700,
          fontFamily: 'var(--font-mono)',
          color: diff > 0 ? 'var(--color-accent-danger)' : 'var(--color-accent-success)',
          margin: '4px 0',
        }}>
          {formatCurrencyFull(Math.abs(diff))}
        </p>
        <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: 0 }}>
          {diff > 0
            ? `Higher fees cost you ${formatCurrencyFull(diff)} over the projection`
            : `Lower fees save you ${formatCurrencyFull(Math.abs(diff))} over the projection`}
        </p>
      </div>
    </div>
  )
}
