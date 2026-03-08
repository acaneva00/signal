'use client'

import type { ProjectionSummary } from '@/types/agent'
import { formatCurrencyFull } from '@/lib/canvas/format'

interface Props {
  summary: ProjectionSummary
  assumptions: string[]
}

export function ProjectionSummaryCard({ summary, assumptions }: Props) {
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
        <Metric
          label="Super at retirement"
          value={formatCurrencyFull(summary.final_super)}
        />
        <Metric
          label="Depletion age"
          value={
            summary.depletion_age
              ? `Age ${summary.depletion_age}`
              : 'Lasts beyond age 90'
          }
          positive={!summary.depletion_age}
        />
        <Metric
          label="Total pension received"
          value={formatCurrencyFull(summary.total_pension)}
        />
        <Metric
          label="Net worth growth"
          value={formatCurrencyFull(summary.net_worth_growth)}
          positive={summary.net_worth_growth >= 0}
        />
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
