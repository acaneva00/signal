/**
 * Helper functions for converting pre-login sessions to user accounts
 */

import { createClient } from '@/lib/supabase/server'

// Band midpoints for converting pre-login data to financial profile
const BAND_MIDPOINTS = {
  age_range: {
    '18-25': 21.5,
    '26-35': 30.5,
    '36-45': 40.5,
    '46-55': 50.5,
    '56-65': 60.5,
    '65+': 70,
  },
  income_band: {
    'under_45k': 30000,
    '45k_90k': 67500,
    '90k_135k': 112500,
    '135k_200k': 167500,
    '200k_plus': 250000,
  },
  super_balance_band: {
    'under_50k': 25000,
    '50k_150k': 100000,
    '150k_400k': 275000,
    '400k_800k': 600000,
    '800k_plus': 1000000,
    'no_idea': null, // Will use age-based estimate
  },
}

// Employment type mapping
const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  'full_time': 'Full-time employed',
  'part_time': 'Part-time/casual',
  'self_employed': 'Self-employed',
  'not_working': 'Not working',
  'retired': 'Retired',
}

/**
 * Convert pre-login session data to user's financial profile
 */
export async function convertPreLoginSession(
  userId: string,
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    // Fetch the pre-login session
    const { data: session, error: sessionError } = await supabase
      .from('pre_login_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return { success: false, error: 'Session not found' }
    }

    const { session_data } = session

    // Build financial profile data
    const profileData: Record<string, any> = {}

    // Age
    if (session_data.age_range) {
      const ageKey = session_data.age_range as keyof typeof BAND_MIDPOINTS.age_range
      profileData.age = BAND_MIDPOINTS.age_range[ageKey]
      profileData.age_range = session_data.age_range
    }

    // Employment
    if (session_data.employment_type) {
      profileData.employment_type = EMPLOYMENT_TYPE_MAP[session_data.employment_type]
    }

    // Income
    if (session_data.income_band) {
      const incomeKey = session_data.income_band as keyof typeof BAND_MIDPOINTS.income_band
      profileData.annual_income = BAND_MIDPOINTS.income_band[incomeKey]
      profileData.income_band = session_data.income_band
    }

    // Super balance
    if (session_data.super_balance_band) {
      const superKey = session_data.super_balance_band as keyof typeof BAND_MIDPOINTS.super_balance_band
      const superMidpoint = BAND_MIDPOINTS.super_balance_band[superKey]
      
      if (superMidpoint !== null) {
        profileData.super_balance = superMidpoint
      } else if (profileData.age) {
        // Use age-based estimate if they selected "no_idea"
        profileData.super_balance = estimateSuperBalance(profileData.age, profileData.annual_income || 75000)
      }
      
      profileData.super_balance_band = session_data.super_balance_band
    }

    // Create or update financial profile
    const { error: profileError } = await supabase
      .from('financial_profiles')
      .upsert({
        user_id: userId,
        profile_data: profileData,
        self_assessments: {},
        engaged_domains: {},
        fact_find_data: {
          source: 'pre_login_onboarding',
          confidence: 0.6,
          collected_at: new Date().toISOString(),
        },
      })

    if (profileError) {
      console.error('Failed to create financial profile:', profileError)
      return { success: false, error: 'Failed to create profile' }
    }

    // Save goal if provided
    if (session_data.goal_text) {
      const { error: goalError } = await supabase
        .from('goals')
        .insert({
          user_id: userId,
          goal_text: session_data.goal_text,
          status: 'active',
          progress: 0,
        })

      if (goalError) {
        console.error('Failed to save goal:', goalError)
        // Don't fail the whole conversion if goal save fails
      }
    }

    // Mark session as converted
    const { error: updateError } = await supabase
      .from('pre_login_sessions')
      .update({ converted_to_user_id: userId })
      .eq('id', sessionId)

    if (updateError) {
      console.error('Failed to mark session as converted:', updateError)
      // Don't fail - the important data is already saved
    }

    return { success: true }
  } catch (error) {
    console.error('Error converting pre-login session:', error)
    return { success: false, error: 'Internal error' }
  }
}

/**
 * Estimate super balance based on age and income
 * Uses rough approximation: super = income * 0.11 * years_working
 */
function estimateSuperBalance(age: number, annualIncome: number): number {
  // Assume started working at 18
  const yearsWorking = Math.max(0, age - 18)
  // Assume 11% super contribution on average
  const estimatedSuper = annualIncome * 0.11 * yearsWorking
  
  // Round to nearest $10k
  return Math.round(estimatedSuper / 10000) * 10000
}

/**
 * Get pre-login session ID from request cookies
 */
export function getPreLoginSessionId(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null
  
  const match = cookieHeader.match(/pre_login_session_id=([^;]+)/)
  return match ? match[1] : null
}
