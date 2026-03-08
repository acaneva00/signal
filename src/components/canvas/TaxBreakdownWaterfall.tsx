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

const TICK_STYLE = { fontSize: 11, fill: '#8B8FA8' }
const TOOLTIP_STYLE = {
  backgroundColor: '#16181F',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#F0F2F5',
}

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
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 2 }}>
        Tax Breakdown — FY{detail.financial_year}
      </h3>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', marginBottom: 12 }}>Age {detail.age}</p>
      <div className="w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8B8FA8' }} interval={0} angle={-20} textAnchor="end" height={50} />
            <YAxis tickFormatter={formatCurrency} tick={TICK_STYLE} width={60} />
            <Tooltip
              formatter={((value: number, name: string) => {
                if (name === 'base') return [null, null]
                return [formatCurrencyFull(value), 'Amount']
              }) as never}
              contentStyle={TOOLTIP_STYLE}
            />
            <ReferenceLine y={0} stroke="#4A4D5E" />
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
