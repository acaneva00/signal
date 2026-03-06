'use client'

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from 'recharts'
import type { YearlyDetail } from '@/types/agent'
import { formatCurrency, formatCurrencyFull, COLORS } from '@/lib/canvas/format'

interface Props {
  detail: YearlyDetail
}

interface WaterfallEntry {
  name: string
  base: number
  amount: number
  total: number
  isSubtotal: boolean
}

export function TaxBreakdownWaterfall({ detail }: Props) {
  const steps: WaterfallEntry[] = []
  let running = 0

  const gross = detail.gross_income
  steps.push({ name: 'Gross Income', base: 0, amount: gross, total: gross, isSubtotal: true })
  running = gross

  const taxAmount = -detail.tax
  steps.push({ name: 'Income Tax', base: running + taxAmount, amount: taxAmount, total: running + taxAmount, isSubtotal: false })
  running += taxAmount

  if (detail.medicare_levy > 0) {
    const medicare = -detail.medicare_levy
    steps.push({ name: 'Medicare Levy', base: running + medicare, amount: medicare, total: running + medicare, isSubtotal: false })
    running += medicare
  }

  if (detail.hecs_repayment > 0) {
    const hecs = -detail.hecs_repayment
    steps.push({ name: 'HELP Repayment', base: running + hecs, amount: hecs, total: running + hecs, isSubtotal: false })
    running += hecs
  }

  steps.push({ name: 'Net Income', base: 0, amount: running, total: running, isSubtotal: true })

  const data = steps.map((s) => ({
    name: s.name,
    base: Math.round(s.base),
    amount: Math.round(Math.abs(s.amount)),
    total: Math.round(s.total),
    isPositive: s.amount >= 0,
    isSubtotal: s.isSubtotal,
  }))

  return (
    <div className="w-full">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">
        Tax Breakdown — FY{detail.financial_year}
      </h3>
      <p className="text-xs text-slate-500 mb-3">Age {detail.age}</p>
      <div className="w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#64748B' }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis tickFormatter={formatCurrency} tick={{ fontSize: 12, fill: '#64748B' }} width={60} />
            <Tooltip
              formatter={((value: number, name: string) => {
                if (name === 'base') return [null, null]
                return [formatCurrencyFull(value), 'Amount']
              }) as never}
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #E2E8F0',
                borderRadius: '8px',
                fontSize: '13px',
              }}
            />
            <ReferenceLine y={0} stroke="#94A3B8" />
            <Bar dataKey="base" stackId="waterfall" fill="transparent" />
            <Bar dataKey="amount" stackId="waterfall" radius={[3, 3, 0, 0]}>
              {data.map((entry, idx) => (
                <Cell
                  key={idx}
                  fill={
                    entry.isSubtotal
                      ? COLORS.waterfall.subtotal
                      : entry.isPositive
                        ? COLORS.waterfall.income
                        : COLORS.waterfall.deduction
                  }
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
