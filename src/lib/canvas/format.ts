export function formatCurrency(value: number): string {
  const abs = Math.abs(value)
  const sign = value < 0 ? '-' : ''
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`
  return `${sign}$${Math.round(abs)}`
}

export function formatCurrencyFull(value: number): string {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

export const COLORS = {
  navy: '#4F8EF7',
  pensionArea: '#7C6AF7',
  netWorth: '#F0F2F5',
  accent: '#34D399',
  positive: '#34D399',
  negative: '#F87171',
  neutral: '#8B8FA8',
  scenarioA: '#4F8EF7',
  scenarioB: '#FBBF24',
  grid: 'rgba(255,255,255,0.06)',
  waterfall: {
    income: '#34D399',
    deduction: '#F87171',
    subtotal: '#4F8EF7',
    surplus: '#34D399',
    deficit: '#F87171',
  },
} as const
