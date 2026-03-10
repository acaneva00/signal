/**
 * Helper functions for converting pre-login sessions to user accounts
 */

import { createClient } from '@/lib/supabase/server'
import { generatePersonalisedGreeting } from '@/lib/onboarding/personalisation'

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
  age_bracket: {
    under_25: 22,
    '25_34': 30,
    '35_44': 40,
    '45_54': 50,
    '55_64': 60,
    '65_plus': 68,
  } as Record<string, number>,
  income_band: {
    under_50k: 40_000,
    '50k_100k': 75_000,
    '100k_150k': 125_000,
    '150k_200k': 175_000,
    '200k_plus': 250_000,
  } as Record<string, number>,
  super_balance_band: {
    under_50k: 25000,
    '50k_150k': 100000,
    '150k_400k': 275000,
    '400k_800k': 600000,
    '800k_plus': 1000000,
    no_idea: null,
  } as Record<string, number | null>,
}

// Employment type mapping
const EMPLOYMENT_TYPE_MAP: Record<string, string> = {
  full_time: 'Full-time employed',
  part_time: 'Part-time/casual',
  self_employed: 'Self-employed',
  not_working: 'Not working',
  retired: 'Retired',
}

/**
 * Convert pre-login session data to user's financial profile
 */
export async function convertPreLoginSession(
  userId: string,
  sessionId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient()

    const { data: session, error: sessionError } = await supabase
      .from('pre_login_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()

    if (sessionError || !session) {
      return { success: false, error: 'Session not found' }
    }

    const { session_data } = session

    const profileData: Record<string, unknown> = {}

    // Age — quiz field (age_bracket) takes priority over legacy field (age_range)
    if (session_data.age_bracket) {
      const age = BAND_MIDPOINTS.age_bracket[session_data.age_bracket as string]
      if (age != null) {
        profileData.age = age
        profileData.age_bracket = session_data.age_bracket
      }
    } else if (session_data.age_range) {
      const ageKey = session_data.age_range as keyof typeof BAND_MIDPOINTS.age_range
      profileData.age = BAND_MIDPOINTS.age_range[ageKey]
      profileData.age_range = session_data.age_range
    }

    // Household
    if (session_data.household) {
      const h = session_data.household as string
      if (h === 'partnered' || h === 'partnered_with_kids') {
        profileData.relationship_status = 'partnered'
      } else {
        profileData.relationship_status = 'single'
      }
      if (h === 'single_with_kids' || h === 'partnered_with_kids') {
        profileData.has_dependants = true
      }
    }

    // Employment
    if (session_data.employment_type) {
      profileData.employment_type = EMPLOYMENT_TYPE_MAP[session_data.employment_type as string]
    }

    // Income — quiz field (income_bracket) takes priority over legacy (income_band)
    if (session_data.income_bracket) {
      const income = BAND_MIDPOINTS.income_band[session_data.income_bracket as string]
      if (income != null) {
        profileData.annual_income = income
        profileData.income_bracket = session_data.income_bracket
      }
    } else if (session_data.income_band) {
      const income = BAND_MIDPOINTS.income_band[session_data.income_band as string]
      if (income != null) {
        profileData.annual_income = income
        profileData.income_band = session_data.income_band
      }
    }

    // Super balance
    if (session_data.super_balance_band) {
      const superKey = session_data.super_balance_band as string
      const superMidpoint = BAND_MIDPOINTS.super_balance_band[superKey]

      if (superMidpoint !== null && superMidpoint !== undefined) {
        profileData.super_balance = superMidpoint
      } else if (typeof profileData.age === 'number') {
        profileData.super_balance = estimateSuperBalance(
          profileData.age,
          (profileData.annual_income as number) || 75000,
        )
      }

      profileData.super_balance_band = session_data.super_balance_band
    }

    // Financial confidence
    if (session_data.financial_confidence) {
      profileData.financial_confidence = session_data.financial_confidence
    }

    // Priority areas
    if (session_data.priority_areas) {
      profileData.priority_areas = session_data.priority_areas
    }

    const factFindData: Record<string, unknown> = {
      source: 'pre_login_onboarding',
      confidence: 0.6,
      collected_at: new Date().toISOString(),
    }

    const { error: profileError } = await supabase.from('financial_profiles').upsert({
      user_id: userId,
      profile_data: profileData,
      self_assessments: {},
      engaged_domains: {},
      fact_find_data: factFindData,
    })

    if (profileError) {
      console.error('Failed to create financial profile:', profileError)
      return { success: false, error: 'Failed to create profile' }
    }

    // Persist personalised greeting, suggested intents, and preferred name into fact_find_data
    const factFindUpdates: Record<string, unknown> = {}
    if (session_data.personalised_greeting) {
      factFindUpdates.personalised_greeting = session_data.personalised_greeting as string
    }
    if (session_data.suggested_intents) {
      factFindUpdates.suggested_intents = session_data.suggested_intents as string[]
    }
    if (session_data.preferred_name) {
      factFindUpdates.preferred_name = session_data.preferred_name as string
    }

    if (Object.keys(factFindUpdates).length > 0) {
      await supabase
        .from('financial_profiles')
        .update({
          fact_find_data: {
            ...factFindData,
            ...factFindUpdates,
          },
        })
        .eq('user_id', userId)
    }

    // Save goal if provided
    if (session_data.goal_text) {
      const { error: goalError } = await supabase.from('goals').insert({
        user_id: userId,
        goal_text: session_data.goal_text,
        status: 'active',
        progress: 0,
      })

      if (goalError) {
        console.error('Failed to save goal:', goalError)
      }
    }

    // Mark session as converted
    const { error: updateError } = await supabase
      .from('pre_login_sessions')
      .update({ converted_to_user_id: userId })
      .eq('id', sessionId)

    if (updateError) {
      console.error('Failed to mark session as converted:', updateError)
    }

    return { success: true }
  } catch (error) {
    console.error('Error converting pre-login session:', error)
    return { success: false, error: 'Internal error' }
  }
}

/**
 * Estimate super balance based on age and income
 */
function estimateSuperBalance(age: number, annualIncome: number): number {
  const yearsWorking = Math.max(0, age - 18)
  const estimatedSuper = annualIncome * 0.11 * yearsWorking
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
