'use client'

import type { ProjectionSummary } from '@/types/agent'
import { formatCurrencyFull } from '@/lib/canvas/format'

interface Props {
  summary: ProjectionSummary
}

export function BalanceSheetCards({ summary }: Props) {
  const { opening_position: open, closing_position: close } = summary

  return (
    <div className="w-full" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h3 style={{ fontSize: 13, fontWeight: 600, color: 'var(--color-text-secondary)' }}>Balance Sheet</h3>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <PositionCard title="Opening" position={open} />
        <PositionCard title="Closing" position={close} />
      </div>

      <div
        style={{
          padding: 12,
          background: 'var(--color-bg-surface)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span style={{ fontSize: 13, color: 'var(--color-text-secondary)' }}>Net Worth Change</span>
        <span
          style={{
            fontSize: 14,
            fontWeight: 700,
            fontFamily: 'var(--font-mono)',
            color: summary.net_worth_growth >= 0 ? 'var(--color-accent-success)' : 'var(--color-accent-danger)',
          }}
        >
          {summary.net_worth_growth >= 0 ? '+' : ''}
          {formatCurrencyFull(summary.net_worth_growth)}
        </span>
      </div>

      {summary.milestones.length > 0 && (
        <div>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--color-text-muted)', marginBottom: 6 }}>Milestones</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {summary.milestones.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 11, color: 'var(--color-text-secondary)' }}>
                <span style={{ flexShrink: 0, width: 56, color: 'var(--color-text-muted)' }}>
                  {m.month}/{m.year}
                </span>
                <span>{m.event}</span>
                {m.amount != null && (
                  <span style={{ marginLeft: 'auto', fontWeight: 500, fontFamily: 'var(--font-mono)', color: 'var(--color-text-primary)' }}>
                    {formatCurrencyFull(m.amount)}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function PositionCard({
  title,
  position,
}: {
  title: string
  position: { net_worth: number; total_assets: number; total_super: number; total_liabilities: number }
}) {
  return (
    <div
      style={{
        padding: 12,
        background: 'var(--color-bg-surface)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-md)',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <p style={{
        fontSize: 11,
        fontWeight: 600,
        color: 'var(--color-text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        margin: 0,
      }}>{title}</p>
      <Row label="Total Assets" value={position.total_assets} />
      <Row label="Super" value={position.total_super} />
      <Row label="Liabilities" value={-position.total_liabilities} negative />
      <div style={{ paddingTop: 6, borderTop: '1px solid var(--color-border)' }}>
        <Row label="Net Worth" value={position.net_worth} bold />
      </div>
    </div>
  )
}

function Row({
  label,
  value,
  negative,
  bold,
}: {
  label: string
  value: number
  negative?: boolean
  bold?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 11, fontWeight: bold ? 600 : 400, color: bold ? 'var(--color-text-primary)' : 'var(--color-text-secondary)' }}>
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          fontFamily: 'var(--font-mono)',
          fontVariantNumeric: 'tabular-nums',
          fontWeight: bold ? 700 : 400,
          color: bold
            ? 'var(--color-text-primary)'
            : negative
              ? 'var(--color-accent-danger)'
              : 'var(--color-text-secondary)',
        }}
      >
        {formatCurrencyFull(value)}
      </span>
    </div>
  )
}
