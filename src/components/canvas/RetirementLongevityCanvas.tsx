'use client'

/**
 * IMPLEMENTATION NOTE: This chart renders exactly four income/shortfall concepts:
 * 1. Earned income (employment)
 * 2. Passive income (minimum ABP + age pension + non-super income)
 * 3. Secondary sources (additional ABP + lump sum + cash drawdown + sale drawdown)
 * 4. Net shortfall (residual gap when all sources are exhausted)
 *
 * gross_shortfall must NEVER be rendered — no series, no reference line,
 * no tooltip entry, no legend entry. It is computed in the engine and carried
 * in TrajectoryPoint for internal use only.
 */

import {
  ComposedChart,
  Line,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts'
import type { TrajectoryPoint, ProjectionSummary } from '@/types/agent'
import { formatCurrency, formatCurrencyFull, COLORS } from '@/lib/canvas/format'
import { ProjectionSummaryCard } from './ProjectionSummaryCard'

const TICK_STYLE = { fontSize: 11, fill: '#8B8FA8' }
const TOOLTIP_STYLE = {
  backgroundColor: '#16181F',
  border: '1px solid rgba(255,255,255,0.1)',
  borderRadius: '8px',
  fontSize: '12px',
  color: '#F0F2F5',
}

interface Props {
  trajectory: TrajectoryPoint[]
  depletionAge: number | null
  summary: ProjectionSummary
  assumptions: string[]
  intent: string | null
}

export function RetirementLongevityCanvas({
  trajectory,
  depletionAge,
  summary,
  assumptions,
  intent,
}: Props) {
  if (trajectory.length === 0) return null

  const retirementAge = summary.retirement_age ?? 67

  const isComprehensive = trajectory.some(
    (p) => (p.non_super_asset_total ?? 0) > 0,
  )

  const chartAData = trajectory.map((p) => ({
    age: p.age,
    super_balance: Math.round(p.super_balance),
    non_super_asset_total: Math.round(p.non_super_asset_total ?? 0),
    net_worth: Math.round(p.net_worth),
  }))

  const retirementPoints = trajectory.filter(
    (p) => p.is_retirement_year && p.age <= 90,
  )

  const hasRetirementData = retirementPoints.length > 0

  const chartBData = hasRetirementData
    ? retirementPoints.map((p) => {
        const employmentIncome = Math.round(p.employment_income_annual ?? 0)
        const superDrawdownMin = Math.round(p.super_drawdown_min_annual ?? 0)
        const superDrawdownAdditional = Math.round(
          p.super_drawdown_additional_annual ?? 0,
        )
        const agePension = Math.round(p.age_pension_annual)
        const nonSuperIncome = Math.round(p.non_super_income_annual ?? 0)
        const nonSuperCash = Math.round(p.non_super_drawdown_cash_annual ?? 0)
        const nonSuperSale = Math.round(p.non_super_drawdown_sale_annual ?? 0)
        const taxRefund = Math.round(p.tax_refund_annual ?? 0)
        const totalIncomeRounded =
          employmentIncome +
          superDrawdownMin +
          superDrawdownAdditional +
          agePension +
          nonSuperIncome +
          nonSuperCash +
          nonSuperSale +
          taxRefund
        const totalIncomeRaw =
          (p.employment_income_annual ?? 0) +
          (p.super_drawdown_min_annual ?? 0) +
          (p.super_drawdown_additional_annual ?? 0) +
          (p.age_pension_annual ?? 0) +
          (p.non_super_income_annual ?? 0) +
          (p.non_super_drawdown_cash_annual ?? 0) +
          (p.non_super_drawdown_sale_annual ?? 0) +
          (p.tax_refund_annual ?? 0)
        const target = Math.round(p.retirement_spending_target ?? 0)
        const shortfall =
          target > 0 && totalIncomeRaw < target - 0.5
            ? Math.round(target - totalIncomeRaw)
            : 0

        return {
          age: p.age,
          employment_income: employmentIncome,
          super_drawdown_min: superDrawdownMin,
          super_drawdown_additional: superDrawdownAdditional,
          age_pension: agePension,
          non_super_income: nonSuperIncome,
          non_super_drawdown_cash: nonSuperCash,
          non_super_drawdown_sale: nonSuperSale,
          shortfall,
          total_income: totalIncomeRounded,
          target,
          secondary_cash: Math.round(p.secondary_cash_annual ?? 0),
          secondary_fixed_interest: Math.round(
            p.secondary_fixed_interest_annual ?? 0,
          ),
          secondary_super: Math.round(p.secondary_super_annual ?? 0),
          secondary_shares: Math.round(p.secondary_shares_annual ?? 0),
          secondary_property: Math.round(p.secondary_property_annual ?? 0),
          lump_sum: Math.round(p.lump_sum_annual ?? 0),
        }
      })
    : []

  const hasTarget = chartBData.some((d) => d.target > 0)
  const hasCashOrSaleDrawdown = chartBData.some(
    (d) => (d.non_super_drawdown_cash ?? 0) > 0 || (d.non_super_drawdown_sale ?? 0) > 0,
  )
  const hasAdditionalABP = chartBData.some(
    (d) => (d.super_drawdown_additional ?? 0) > 0,
  )
  const showCashAndSaleBars = isComprehensive || hasCashOrSaleDrawdown

  return (
    <div className="flex flex-col gap-6">
      {/* Chart A — Account Balance Over Time */}
      <div>
        <h3
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: '#F0F2F5',
            marginBottom: 8,
          }}
        >
          Account Balance Over Time
        </h3>
        <div
          style={{
            display: 'flex',
            gap: 12,
            flexWrap: 'wrap',
            marginBottom: 4,
            fontSize: 11,
            color: '#8B8FA8',
          }}
        >
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: COLORS.super,
              }}
            />
            Super balance
          </span>
          {isComprehensive && (
            <>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: COLORS.nonSuperAsset,
                  }}
                />
                Non-super assets
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: COLORS.agePension,
                    border: '1px dashed #8B8FA8',
                  }}
                />
                Total net worth
              </span>
            </>
          )}
        </div>
        <div className="w-full" style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={chartAData}
              margin={{ top: 28, right: 12, left: 8, bottom: 4 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                stroke={COLORS.gridDark}
              />
              <XAxis
                dataKey="age"
                tick={TICK_STYLE}
                label={{
                  value: 'Age',
                  position: 'insideBottomRight',
                  offset: -4,
                  fontSize: 11,
                  fill: '#8B8FA8',
                }}
              />
              <YAxis
                tickFormatter={formatCurrency}
                tick={TICK_STYLE}
                width={60}
              />
              <Tooltip
                formatter={((value: number, name: string) => [
                  formatCurrencyFull(value),
                  name === 'super_balance'
                    ? 'Super balance'
                    : name === 'non_super_asset_total'
                      ? 'Non-super assets'
                      : 'Net worth',
                ]) as never}
                labelFormatter={((label: string) => `Age ${label}`) as never}
                contentStyle={TOOLTIP_STYLE}
              />
              <ReferenceLine
                x={retirementAge}
                stroke="#8B8FA8"
                strokeDasharray="4 4"
                label={{
                  value: 'Retirement',
                  position: 'top',
                  fontSize: 11,
                  fill: '#8B8FA8',
                }}
              />
              {depletionAge && (
                <ReferenceLine
                  x={depletionAge}
                  stroke={COLORS.negative}
                  strokeDasharray="4 4"
                  label={{
                    value: `Super lasts until age ${depletionAge}`,
                    position: 'top',
                    fontSize: 11,
                    fill: COLORS.negative,
                  }}
                />
              )}
              <Line
                type="monotone"
                dataKey="super_balance"
                stroke={COLORS.super}
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 4, fill: COLORS.super }}
                name="super_balance"
              />
              {isComprehensive && (
                <>
                  <Line
                    type="monotone"
                    dataKey="non_super_asset_total"
                    stroke={COLORS.nonSuperAsset}
                    strokeWidth={2}
                    dot={false}
                    activeDot={{ r: 4, fill: COLORS.nonSuperAsset }}
                    name="non_super_asset_total"
                  />
                  <Line
                    type="monotone"
                    dataKey="net_worth"
                    stroke={COLORS.agePension}
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    activeDot={{ r: 4, fill: COLORS.agePension }}
                    name="net_worth"
                  />
                </>
              )}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Chart B — Annual Income in Retirement */}
      {hasRetirementData && (
        <div>
          <h3
            style={{
              fontSize: 13,
              fontWeight: 500,
              color: '#F0F2F5',
              marginBottom: 8,
            }}
          >
            Annual Income in Retirement
          </h3>
          <div
            style={{
              display: 'flex',
              gap: 12,
              flexWrap: 'wrap',
              marginBottom: 4,
              fontSize: 11,
              color: '#8B8FA8',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: COLORS.navy,
                }}
              />
              Employment income
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: COLORS.super,
                }}
              />
              Minimum ABP
            </span>
            {hasAdditionalABP && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: COLORS.additionalABP,
                  }}
                />
                Additional ABP
              </span>
            )}
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 2,
                  background: COLORS.agePension,
                }}
              />
              Age Pension
            </span>
            {isComprehensive && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: COLORS.nonSuperAsset,
                  }}
                />
                Non-super asset income
              </span>
            )}
            {showCashAndSaleBars && (
              <>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: COLORS.nonSuperDrawdownCash,
                    }}
                  />
                  Cash used to fund expenses
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: 2,
                      background: COLORS.nonSuperDrawdownSale,
                    }}
                  />
                  Asset sale (shares/property)
                </span>
              </>
            )}
            {hasTarget && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    border: '1px dashed #8B8FA8',
                    background: 'transparent',
                  }}
                />
                Target spending
              </span>
            )}
            {hasTarget && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 2,
                    background: COLORS.shortfall,
                    opacity: 0.6,
                  }}
                />
                Shortfall
              </span>
            )}
          </div>
          <div className="w-full" style={{ height: 200 }}>
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartBData}
                margin={{ top: 8, right: 12, left: 8, bottom: 4 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke={COLORS.gridDark}
                />
                <XAxis
                  dataKey="age"
                  tick={TICK_STYLE}
                  label={{
                    value: 'Age',
                    position: 'insideBottomRight',
                    offset: -4,
                    fontSize: 11,
                    fill: '#8B8FA8',
                  }}
                />
                <YAxis
                  tickFormatter={formatCurrency}
                  tick={TICK_STYLE}
                  width={60}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null
                    const d = payload[0].payload
                    const shortfall =
                      d.target > 0 && d.total_income < d.target
                        ? d.target - d.total_income
                        : 0
                    return (
                      <div style={TOOLTIP_STYLE as React.CSSProperties}>
                        <div style={{ padding: 8 }}>
                          <p style={{ margin: '0 0 6px', fontWeight: 600 }}>
                            Age {d.age}
                          </p>
                          {d.employment_income > 0 && (
                            <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                              Employment income:{' '}
                              {formatCurrencyFull(d.employment_income)}
                            </p>
                          )}
                          <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                            Minimum ABP:{' '}
                            {formatCurrencyFull(d.super_drawdown_min)}
                          </p>
                          {(d.super_drawdown_additional ?? 0) > 0 && (
                            <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                              Additional ABP:{' '}
                              {formatCurrencyFull(d.super_drawdown_additional)}
                            </p>
                          )}
                          <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                            Age Pension: {formatCurrencyFull(d.age_pension)}
                          </p>
                          {isComprehensive && (
                            <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                              Non-super income:{' '}
                              {formatCurrencyFull(d.non_super_income)}
                            </p>
                          )}
                          {showCashAndSaleBars && (
                            <>
                              <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                                Cash used to fund expenses:{' '}
                                {formatCurrencyFull(d.non_super_drawdown_cash)}
                              </p>
                              <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                                Asset sale (shares/property):{' '}
                                {formatCurrencyFull(d.non_super_drawdown_sale)}
                              </p>
                            </>
                          )}
                          {((d.secondary_cash ?? 0) > 0 ||
                            (d.secondary_fixed_interest ?? 0) > 0 ||
                            (d.secondary_super ?? 0) > 0 ||
                            (d.secondary_shares ?? 0) > 0 ||
                            (d.secondary_property ?? 0) > 0 ||
                            (d.lump_sum ?? 0) > 0) && (
                            <div style={{ marginTop: 6, paddingTop: 6, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                              <p style={{ margin: '0 0 4px', fontSize: 10, color: '#8B8FA8' }}>
                                Secondary sources breakdown
                              </p>
                              {(d.secondary_cash ?? 0) > 0 && (
                                <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                                  Cash: {formatCurrencyFull(d.secondary_cash)}
                                </p>
                              )}
                              {(d.secondary_fixed_interest ?? 0) > 0 && (
                                <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                                  Fixed interest:{' '}
                                  {formatCurrencyFull(d.secondary_fixed_interest)}
                                </p>
                              )}
                              {(d.secondary_super ?? 0) > 0 && (
                                <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                                  Additional ABP:{' '}
                                  {formatCurrencyFull(d.secondary_super)}
                                </p>
                              )}
                              {(d.secondary_shares ?? 0) > 0 && (
                                <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                                  Shares: {formatCurrencyFull(d.secondary_shares)}
                                </p>
                              )}
                              {(d.secondary_property ?? 0) > 0 && (
                                <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                                  Property:{' '}
                                  {formatCurrencyFull(d.secondary_property)}
                                </p>
                              )}
                              {(d.lump_sum ?? 0) > 0 && (
                                <p style={{ margin: '0 0 2px', fontSize: 11 }}>
                                  Lump sum: {formatCurrencyFull(d.lump_sum)}
                                </p>
                              )}
                            </div>
                          )}
                          <p style={{ margin: '4px 0 0', fontWeight: 600 }}>
                            Total income: {formatCurrencyFull(d.total_income)}
                          </p>
                          {d.target > 0 && (
                            <p style={{ margin: '2px 0 0', fontSize: 11 }}>
                              Target: {formatCurrencyFull(d.target)}
                            </p>
                          )}
                          {shortfall > 0 && (
                            <p
                              style={{
                                margin: '2px 0 0',
                                fontSize: 11,
                                color: COLORS.negative,
                              }}
                            >
                              Shortfall: {formatCurrencyFull(shortfall)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  }}
                />
                <Bar
                  dataKey="employment_income"
                  stackId="income"
                  fill={COLORS.navy}
                  name="Employment income"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="super_drawdown_min"
                  stackId="income"
                  fill={COLORS.super}
                  name="Minimum ABP"
                  radius={[0, 0, 0, 0]}
                />
                <Bar
                  dataKey="age_pension"
                  stackId="income"
                  fill={COLORS.agePension}
                  name="Age Pension"
                  radius={[0, 0, 0, 0]}
                />
                {isComprehensive && (
                  <Bar
                    dataKey="non_super_income"
                    stackId="income"
                    fill={COLORS.nonSuperAsset}
                    name="Non-super asset income"
                    radius={[0, 0, 0, 0]}
                  />
                )}
                {showCashAndSaleBars && (
                  <>
                    <Bar
                      dataKey="non_super_drawdown_cash"
                      stackId="income"
                      fill={COLORS.nonSuperDrawdownCash}
                      name="Cash used to fund expenses"
                      radius={[0, 0, 0, 0]}
                    />
                    {hasAdditionalABP && (
                      <Bar
                        dataKey="super_drawdown_additional"
                        stackId="income"
                        fill={COLORS.additionalABP}
                        name="Additional ABP"
                        radius={[0, 0, 0, 0]}
                      />
                    )}
                    <Bar
                      dataKey="non_super_drawdown_sale"
                      stackId="income"
                      fill={COLORS.nonSuperDrawdownSale}
                      name="Asset sale (shares/property)"
                      radius={[0, 0, 0, 0]}
                    />
                  </>
                )}
                {hasAdditionalABP && !showCashAndSaleBars && (
                  <Bar
                    dataKey="super_drawdown_additional"
                    stackId="income"
                    fill={COLORS.additionalABP}
                    name="Additional ABP"
                    radius={[0, 0, 0, 0]}
                  />
                )}
                <Bar
                  dataKey="shortfall"
                  stackId="income"
                  fill={COLORS.shortfall}
                  fillOpacity={0.4}
                  name="Shortfall"
                  radius={[0, 0, 0, 0]}
                />
                {hasTarget && (
                  <Line
                    type="monotone"
                    dataKey="target"
                    stroke="#8B8FA8"
                    strokeWidth={2}
                    strokeDasharray="4 4"
                    dot={false}
                    name="Target spending"
                  />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      <ProjectionSummaryCard
        summary={summary}
        assumptions={assumptions}
        intent={intent}
      />
    </div>
  )
}
