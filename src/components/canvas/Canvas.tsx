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
import { getCanvasFlags } from '@/lib/intents'

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

  const canvasFlags = getCanvasFlags(intent)
  const showFeeImpact = hasComparison && canvasFlags.showFeeImpact
  const showTaxWaterfall = hasProjection && canvasFlags.showTaxWaterfall
  const showCashFlow = hasProjection && canvasFlags.showCashFlow
  const showBalanceSheet = hasProjection && canvasFlags.showBalanceSheet
  const showForecastTable = hasProjection && projectionSummary!.yearly_detail.length > 3

  return (
    <div className="flex flex-col h-full">
      <ProfileCompleteness completeness={profileCompleteness} />

      {!hasContent ? (
        <EmptyCanvas />
      ) : (
        <ScrollArea className="flex-1 min-h-0">
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {hasComparison && !showFeeImpact && (
              <ScenarioComparisonChart comparison={comparisonResult!} />
            )}

            {showFeeImpact && (
              <FeeImpactBarChart comparison={comparisonResult!} />
            )}

            {hasProjection && !hasComparison && (
              <>
                <div>
                  <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 8 }}>
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

            {showTaxWaterfall && projectionSummary!.yearly_detail[0] && (
              <TaxBreakdownWaterfall detail={projectionSummary!.yearly_detail[0]} />
            )}

            {showCashFlow && projectionSummary!.yearly_detail[0] && (
              <CashFlowWaterfall detail={projectionSummary!.yearly_detail[0]} />
            )}

            {showBalanceSheet && (
              <BalanceSheetCards summary={projectionSummary!} />
            )}

            {showForecastTable && (
              <ForecastTable summary={projectionSummary!} />
            )}

            {disclaimers.length > 0 && (
              <div style={{ paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
                {disclaimers.map((d, i) => (
                  <p key={i} style={{ fontSize: 11, color: 'var(--color-text-muted)', fontStyle: 'italic', margin: '2px 0' }}>
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
