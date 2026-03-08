'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import type { ComparisonResult } from '@/types/agent'
import { formatCurrency, formatCurrencyFull, COLORS } from '@/lib/canvas/format'

const SCENARIO_COLORS = [COLORS.scenarioA, COLORS.scenarioB, '#7C6AF7', '#34D399']

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
  metric?: 'super_balance' | 'net_worth'
}

export function ScenarioComparisonChart({ comparison, metric = 'super_balance' }: Props) {
  if (comparison.scenarios.length === 0) return null

  const maxLen = Math.max(...comparison.scenarios.map((s) => s.trajectory.length))
  const merged: Record<string, number | string>[] = []

  for (let i = 0; i < maxLen; i++) {
    const row: Record<string, number | string> = {}
    let age = 0
    for (const scenario of comparison.scenarios) {
      const point = scenario.trajectory[i]
      if (point) {
        age = point.age
        row[scenario.scenario_name] = Math.round(point[metric])
      }
    }
    row.age = age
    merged.push(row)
  }

  const metricLabel = metric === 'super_balance' ? 'Super Balance' : 'Net Worth'

  return (
    <div className="w-full">
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
        Scenario Comparison — {metricLabel}
      </h3>
      <div className="w-full h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
            <XAxis
              dataKey="age"
              tick={TICK_STYLE}
              label={{ value: 'Age', position: 'insideBottomRight', offset: -4, fontSize: 11, fill: '#8B8FA8' }}
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={TICK_STYLE}
              width={60}
            />
            <Tooltip
              formatter={((value: number) => [formatCurrencyFull(value), metricLabel]) as never}
              labelFormatter={((label: string) => `Age ${label}`) as never}
              contentStyle={TOOLTIP_STYLE}
            />
            <Legend wrapperStyle={{ fontSize: '11px', color: '#8B8FA8' }} />
            {comparison.scenarios.map((scenario, idx) => (
              <Line
                key={scenario.scenario_name}
                type="monotone"
                dataKey={scenario.scenario_name}
                stroke={SCENARIO_COLORS[idx % SCENARIO_COLORS.length]}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {comparison.scenarios.map((s, idx) => (
          <div
            key={s.scenario_name}
            style={{
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--color-border)',
              borderLeftWidth: 3,
              borderLeftColor: SCENARIO_COLORS[idx % SCENARIO_COLORS.length],
              padding: 12,
              background: 'var(--color-bg-surface)',
            }}
          >
            <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', margin: 0 }}>
              {s.scenario_name}
            </p>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--color-text-primary)', fontFamily: 'var(--font-mono)', margin: '4px 0 0' }}>
              {formatCurrencyFull(metric === 'super_balance' ? s.final_super : s.final_net_worth)}
            </p>
            <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '2px 0 0' }}>
              {s.depletion_age ? `Depletes at ${s.depletion_age}` : 'Lasts beyond 90'}
            </p>
          </div>
        ))}
      </div>

      {comparison.best_outcome && (
        <p style={{ marginTop: 8, fontSize: 11, fontWeight: 500, color: 'var(--color-accent-success)' }}>
          Best outcome: {comparison.best_outcome}
        </p>
      )}
    </div>
  )
}
