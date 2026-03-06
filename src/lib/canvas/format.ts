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
  navy: '#1A365D',
  pensionArea: '#63B3ED',
  netWorth: '#2D3748',
  accent: '#4299E1',
  positive: '#38A169',
  negative: '#E53E3E',
  neutral: '#A0AEC0',
  scenarioA: '#1A365D',
  scenarioB: '#DD6B20',
  grid: '#E2E8F0',
  waterfall: {
    income: '#38A169',
    deduction: '#E53E3E',
    subtotal: '#4299E1',
    surplus: '#38A169',
    deficit: '#E53E3E',
  },
} as const
