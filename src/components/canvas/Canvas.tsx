'use client'

import { ScrollArea } from '@/components/ui/scroll-area'
import type { ProjectionSummary, ComparisonResult } from '@/types/agent'
import { ProjectionLineChart } from './ProjectionLineChart'
import { ProjectionSummaryCard } from './ProjectionSummaryCard'
import { ScenarioComparisonChart } from './ScenarioComparisonChart'
import { FeeImpactBarChart } from './FeeImpactBarChart'
import { TaxBreakdownWaterfall } from './TaxBreakdownWaterfall'
import { CashFlowWaterfall } from './CashFlowWaterfall'
import { BalanceSheetCards } from './BalanceSheetCards'
import { ForecastTable } from './ForecastTable'
import { ProfileCompleteness } from './ProfileCompleteness'
import { EmptyCanvas } from './EmptyCanvas'

export interface CanvasProps {
  projectionSummary: ProjectionSummary | null
  comparisonResult: ComparisonResult | null
  intent: string | null
  assumptions: string[]
  disclaimers: string[]
  profileCompleteness: number
}

export function Canvas({
  projectionSummary,
  comparisonResult,
  intent,
  assumptions,
  disclaimers,
  profileCompleteness,
}: CanvasProps) {
  const hasProjection = projectionSummary !== null
  const hasComparison = comparisonResult !== null
  const hasContent = hasProjection || hasComparison

  const showFeeImpact = hasComparison && intent === 'fee_impact'
  const showTaxWaterfall = hasProjection && intent === 'take_home_pay'
  const showCashFlow = hasProjection && (intent === 'household_net_worth' || intent === 'super_longevity')
  const showBalanceSheet = hasProjection && intent === 'household_net_worth'
  const showForecastTable = hasProjection && projectionSummary!.yearly_detail.length > 3

  return (
    <div className="flex flex-col h-full">
      <ProfileCompleteness completeness={profileCompleteness} />

      {!hasContent ? (
        <EmptyCanvas />
      ) : (
        <ScrollArea className="flex-1">
          <div className="p-4 space-y-5">
            {/* Scenario Comparison (dual line) */}
            {hasComparison && !showFeeImpact && (
              <ScenarioComparisonChart comparison={comparisonResult!} />
            )}

            {/* Fee Impact Bar Chart */}
            {showFeeImpact && (
              <FeeImpactBarChart comparison={comparisonResult!} />
            )}

            {/* Primary Projection Line Chart */}
            {hasProjection && !hasComparison && (
              <>
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-2">
                    Projected Super Balance
                  </h3>
                  <ProjectionLineChart
                    trajectory={projectionSummary!.trajectory}
                    depletionAge={projectionSummary!.depletion_age}
                  />
                </div>
                <ProjectionSummaryCard
                  summary={projectionSummary!}
                  assumptions={assumptions}
                />
              </>
            )}

            {/* Tax Breakdown Waterfall */}
            {showTaxWaterfall && projectionSummary!.yearly_detail[0] && (
              <TaxBreakdownWaterfall detail={projectionSummary!.yearly_detail[0]} />
            )}

            {/* Cash Flow Waterfall */}
            {showCashFlow && projectionSummary!.yearly_detail[0] && (
              <CashFlowWaterfall detail={projectionSummary!.yearly_detail[0]} />
            )}

            {/* Balance Sheet Cards */}
            {showBalanceSheet && (
              <BalanceSheetCards summary={projectionSummary!} />
            )}

            {/* Forecast Table */}
            {showForecastTable && (
              <ForecastTable summary={projectionSummary!} />
            )}

            {/* Disclaimers */}
            {disclaimers.length > 0 && (
              <div className="pt-3 border-t border-slate-100">
                {disclaimers.map((d, i) => (
                  <p key={i} className="text-xs text-slate-400 italic">
                    {d}
                  </p>
                ))}
              </div>
            )}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
