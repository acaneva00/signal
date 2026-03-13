import type { CalculationIntentName } from '@/lib/intents'

export const INTENT_CHIP_LABELS: Record<CalculationIntentName, string> = {
  super_at_age:            '💰 How much super will I have at retirement?',
  super_longevity:         '📊 Will my super last through retirement?',
  take_home_pay:           '💸 What\'s my take-home pay?',
  aged_pension:            '🏛️ Will I qualify for the aged pension?',
  compare_retirement_age:  '📅 What\'s the difference between retiring at 60 vs 67?',
  fee_impact:              '🔍 How much are my super fees costing me?',
  extra_mortgage_payment:  '🏠 What\'s the impact of extra mortgage repayments?',
  household_net_worth:     '📈 What\'s our household net worth projection?',
  compare_fund:            '⚖️ How do my super fund fees compare?',
  compare_super_projection: '📊 How would my super compare at retirement if I switched funds?',
  compare_super_longevity:   '⏱️ Which fund would make my super last longer?',
}
