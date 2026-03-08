'use client'

interface Props {
  completeness: number
}

export function ProfileCompleteness({ completeness }: Props) {
  if (completeness >= 1) return null

  const pct = Math.round(completeness * 100)

  return (
    <div style={{ position: 'relative' }}>
      {/* Thin progress bar at very top */}
      <div
        style={{
          width: '100%',
          height: 2,
          background: 'var(--color-bg-elevated)',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${pct}%`,
            background: 'var(--color-accent-primary)',
            borderRadius: 1,
            transition: 'width 500ms ease',
          }}
        />
      </div>
      {/* Label */}
      <div style={{ textAlign: 'right', padding: '4px 12px 0' }}>
        <span style={{ fontSize: 10, color: 'var(--color-text-muted)' }}>
          {pct}% complete
        </span>
      </div>
    </div>
  )
}
