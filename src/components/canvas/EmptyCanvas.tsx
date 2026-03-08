'use client'

function EqualizerBars() {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="4" y="18" width="6" rx="3" fill="var(--color-accent-primary)" fillOpacity="0.3">
        <animate
          attributeName="height"
          values="12;28;12"
          dur="1.2s"
          repeatCount="indefinite"
          begin="0s"
        />
        <animate
          attributeName="y"
          values="24;10;24"
          dur="1.2s"
          repeatCount="indefinite"
          begin="0s"
        />
      </rect>
      <rect x="15" y="10" width="6" rx="3" fill="var(--color-accent-primary)" fillOpacity="0.3">
        <animate
          attributeName="height"
          values="20;36;20"
          dur="1.2s"
          repeatCount="indefinite"
          begin="0.15s"
        />
        <animate
          attributeName="y"
          values="18;4;18"
          dur="1.2s"
          repeatCount="indefinite"
          begin="0.15s"
        />
      </rect>
      <rect x="26" y="14" width="6" rx="3" fill="var(--color-accent-primary)" fillOpacity="0.3">
        <animate
          attributeName="height"
          values="16;40;16"
          dur="1.2s"
          repeatCount="indefinite"
          begin="0.3s"
        />
        <animate
          attributeName="y"
          values="20;2;20"
          dur="1.2s"
          repeatCount="indefinite"
          begin="0.3s"
        />
      </rect>
      <rect x="37" y="12" width="6" rx="3" fill="var(--color-accent-primary)" fillOpacity="0.3">
        <animate
          attributeName="height"
          values="24;32;24"
          dur="1.2s"
          repeatCount="indefinite"
          begin="0.45s"
        />
        <animate
          attributeName="y"
          values="16;8;16"
          dur="1.2s"
          repeatCount="indefinite"
          begin="0.45s"
        />
      </rect>
    </svg>
  )
}

export function EmptyCanvas() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        padding: 24,
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}>
          <EqualizerBars />
        </div>
        <p style={{
          fontSize: 16,
          fontWeight: 600,
          color: 'var(--color-text-secondary)',
          margin: '0 0 6px',
        }}>
          Visualisations
        </p>
        <p style={{
          fontSize: 13,
          fontWeight: 400,
          color: 'var(--color-text-muted)',
          maxWidth: 200,
          margin: '0 auto',
          lineHeight: 1.5,
        }}>
          Ask a financial question to see projections and charts here.
        </p>
      </div>
    </div>
  )
}
