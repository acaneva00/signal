'use client'

import type { ProjectionSummary } from '@/types/agent'
import { formatCurrencyFull } from '@/lib/canvas/format'

interface Props {
  summary: ProjectionSummary
  assumptions: string[]
  intent: string | null
}

interface MetricDef {
  label: string
  value: string
  positive?: boolean
}

function getMetrics(summary: ProjectionSummary, intent: string | null): MetricDef[] {
  if (intent === 'super_longevity') {
    return [
      {
        label: 'Super at retirement',
        value: formatCurrencyFull(summary.final_super),
      },
      {
        label: 'Super lasts until',
        value: summary.depletion_age
          ? `Age ${summary.depletion_age}`
          : 'Beyond age 99',
        positive: !summary.depletion_age,
      },
      {
        label: 'Total pension received',
        value: formatCurrencyFull(summary.total_pension),
      },
      {
        label: 'Final net worth',
        value: formatCurrencyFull(summary.final_net_worth),
      },
    ]
  }

  if (['super_at_age', 'compare_retirement_age', 'fee_impact', 'compare_super_projection'].includes(intent ?? '')) {
    return [
      {
        label: 'Super at retirement',
        value: formatCurrencyFull(summary.final_super),
      },
      {
        label: 'Projection period',
        value: summary.projection_period,
      },
    ]
  }

  if (intent === 'take_home_pay') {
    const yd = summary.yearly_detail[0]
    if (!yd) return []
    const effectiveRate = yd.gross_income > 0
      ? ((yd.tax / yd.gross_income) * 100).toFixed(1) + '%'
      : '0%'
    return [
      {
        label: 'Gross income',
        value: formatCurrencyFull(yd.gross_income),
      },
      {
        label: 'Total tax',
        value: formatCurrencyFull(yd.tax),
      },
      {
        label: 'Net income',
        value: formatCurrencyFull(yd.net_income),
      },
      {
        label: 'Effective tax rate',
        value: effectiveRate,
      },
    ]
  }

  if (intent === 'household_net_worth') {
    return [
      {
        label: 'Current net worth',
        value: formatCurrencyFull(summary.opening_position.net_worth),
      },
      {
        label: 'Projected net worth',
        value: formatCurrencyFull(summary.final_net_worth),
      },
      {
        label: 'Growth',
        value: formatCurrencyFull(summary.net_worth_growth),
        positive: summary.net_worth_growth >= 0,
      },
      {
        label: 'Projection period',
        value: summary.projection_period,
      },
    ]
  }

  return [
    {
      label: 'Super at retirement',
      value: formatCurrencyFull(summary.final_super),
    },
    {
      label: 'Final net worth',
      value: formatCurrencyFull(summary.final_net_worth),
    },
    {
      label: 'Projection period',
      value: summary.projection_period,
    },
  ]
}

export function ProjectionSummaryCard({ summary, assumptions, intent }: Props) {
  const metrics = getMetrics(summary, intent)

  if (metrics.length === 0) return null

  return (
    <div
      style={{
        padding: 16,
        marginTop: 12,
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        {metrics.map((m) => (
          <Metric key={m.label} label={m.label} value={m.value} positive={m.positive} />
        ))}
      </div>

      {assumptions.length > 0 && (
        <div style={{ paddingTop: 10, marginTop: 12, borderTop: '1px solid var(--color-border)' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 4 }}>Assumptions</p>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {assumptions.map((a, i) => (
              <li key={i} style={{ fontSize: 11, color: 'var(--color-text-secondary)', display: 'flex', gap: 6, marginBottom: 2 }}>
                <span style={{ color: 'var(--color-text-muted)', flexShrink: 0 }}>•</span>
                {a}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function Metric({
  label,
  value,
  positive,
}: {
  label: string
  value: string
  positive?: boolean
}) {
  return (
    <div>
      <p style={{ fontSize: 11, color: 'var(--color-text-muted)', margin: '0 0 2px' }}>{label}</p>
      <p
        style={{
          fontSize: 14,
          fontWeight: 600,
          fontFamily: 'var(--font-mono)',
          margin: 0,
          color: positive === true
            ? 'var(--color-accent-success)'
            : positive === false
              ? 'var(--color-accent-danger)'
              : 'var(--color-text-primary)',
        }}
      >
        {value}
      </p>
    </div>
  )
}
