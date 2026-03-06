'use client'

import {
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { TrajectoryPoint } from '@/types/agent'
import { formatCurrency, formatCurrencyFull, COLORS } from '@/lib/canvas/format'

interface Props {
  trajectory: TrajectoryPoint[]
  depletionAge: number | null
}

export function ProjectionLineChart({ trajectory, depletionAge }: Props) {
  if (trajectory.length === 0) return null

  const data = trajectory.map((p) => ({
    age: p.age,
    super_balance: Math.round(p.super_balance),
    age_pension: Math.round(p.age_pension_annual),
    net_worth: Math.round(p.net_worth),
  }))

  return (
    <div className="w-full h-[320px]">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
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
            formatter={((value: number, name: string) => [
              formatCurrencyFull(value),
              name === 'super_balance'
                ? 'Super Balance'
                : name === 'age_pension'
                  ? 'Age Pension (annual)'
                  : 'Net Worth',
            ]) as never}
            labelFormatter={((label: string) => `Age ${label}`) as never}
            contentStyle={{
              backgroundColor: 'white',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              fontSize: '13px',
            }}
          />
          <Area
            type="monotone"
            dataKey="age_pension"
            fill={COLORS.pensionArea}
            fillOpacity={0.3}
            stroke={COLORS.pensionArea}
            strokeWidth={1}
            name="age_pension"
          />
          <Line
            type="monotone"
            dataKey="super_balance"
            stroke={COLORS.navy}
            strokeWidth={2.5}
            dot={false}
            activeDot={{ r: 4, fill: COLORS.navy }}
            name="super_balance"
          />
          {depletionAge && (
            <ReferenceLine
              x={depletionAge}
              stroke={COLORS.negative}
              strokeDasharray="4 4"
              label={{
                value: `Depleted at ${depletionAge}`,
                position: 'top',
                fontSize: 11,
                fill: COLORS.negative,
              }}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
