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

export function CashFlowWaterfall({ detail }: Props) {
  const entries: { name: string; base: number; amount: number; isSubtotal: boolean; isPositive: boolean }[] = []

  let running = 0
  const netIncome = detail.net_income
  entries.push({ name: 'Net Income', base: 0, amount: netIncome, isSubtotal: true, isPositive: true })
  running = netIncome

  const exp = -detail.expenses
  entries.push({ name: 'Living Expenses', base: running + exp, amount: Math.abs(exp), isSubtotal: false, isPositive: false })
  running += exp

  if (detail.loan_repayments > 0) {
    const loan = -detail.loan_repayments
    entries.push({ name: 'Loan Repayments', base: running + loan, amount: Math.abs(loan), isSubtotal: false, isPositive: false })
    running += loan
  }

  entries.push({
    name: running >= 0 ? 'Surplus' : 'Deficit',
    base: 0,
    amount: Math.abs(running),
    isSubtotal: true,
    isPositive: running >= 0,
  })

  const data = entries.map((e) => ({
    name: e.name,
    base: Math.round(e.base),
    amount: Math.round(e.amount),
    isPositive: e.isPositive,
    isSubtotal: e.isSubtotal,
  }))

  return (
    <div className="w-full">
      <h3 className="text-sm font-semibold text-slate-700 mb-1">
        Cash Flow — FY{detail.financial_year}
      </h3>
      <p className="text-xs text-slate-500 mb-3">Age {detail.age}</p>
      <div className="w-full h-[260px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 12, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#64748B' }} />
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
                      ? entry.isPositive
                        ? COLORS.waterfall.surplus
                        : COLORS.waterfall.deficit
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
