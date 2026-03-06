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

const SCENARIO_COLORS = [COLORS.scenarioA, COLORS.scenarioB, '#805AD5', '#38A169']

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
      <h3 className="text-sm font-semibold text-slate-700 mb-2">
        Scenario Comparison — {metricLabel}
      </h3>
      <div className="w-full h-[320px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={merged} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
            <XAxis
              dataKey="age"
              tick={{ fontSize: 12, fill: '#64748B' }}
              label={{ value: 'Age', position: 'insideBottomRight', offset: -4, fontSize: 12, fill: '#64748B' }}
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fontSize: 12, fill: '#64748B' }}
              width={60}
            />
            <Tooltip
              formatter={((value: number) => [formatCurrencyFull(value), metricLabel]) as never}
              labelFormatter={((label: string) => `Age ${label}`) as never}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Legend
              wrapperStyle={{ fontSize: '12px' }}
            />
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

      <div className="mt-3 grid grid-cols-2 gap-2">
        {comparison.scenarios.map((s, idx) => (
          <div
            key={s.scenario_name}
            className="rounded-lg border border-slate-200 p-3"
            style={{ borderLeftColor: SCENARIO_COLORS[idx % SCENARIO_COLORS.length], borderLeftWidth: 3 }}
          >
            <p className="text-xs font-medium text-slate-600 truncate">{s.scenario_name}</p>
            <p className="text-sm font-semibold text-slate-900 mt-0.5">
              {formatCurrencyFull(metric === 'super_balance' ? s.final_super : s.final_net_worth)}
            </p>
            <p className="text-xs text-slate-500">
              {s.depletion_age ? `Depletes at ${s.depletion_age}` : 'Lasts beyond 90'}
            </p>
          </div>
        ))}
      </div>

      {comparison.best_outcome && (
        <p className="mt-2 text-xs text-green-700 font-medium">
          Best outcome: {comparison.best_outcome}
        </p>
      )}
    </div>
  )
}
