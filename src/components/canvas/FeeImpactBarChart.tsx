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
      <h3 className="text-sm font-semibold text-slate-700 mb-2">
        Fee Impact on Super Balance
      </h3>
      <div className="w-full h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
            <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12, fill: '#64748B' }} width={60} />
            <Tooltip
              formatter={((value: number) => [formatCurrencyFull(value), 'Final Super']) as never}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
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

      <div className="mt-3 rounded-lg bg-slate-50 border border-slate-200 p-3 text-center">
        <p className="text-xs text-slate-500">Difference attributable to fees</p>
        <p className={`text-lg font-bold ${diff > 0 ? 'text-red-600' : 'text-green-700'}`}>
          {formatCurrencyFull(Math.abs(diff))}
        </p>
        <p className="text-xs text-slate-500 mt-0.5">
          {diff > 0
            ? `Higher fees cost you ${formatCurrencyFull(diff)} over the projection`
            : `Lower fees save you ${formatCurrencyFull(Math.abs(diff))} over the projection`}
        </p>
      </div>
    </div>
  )
}
