import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import {
  generateAIGreeting,
  generatePersonalisedGreeting,
  type OnboardingGreetingData,
} from '@/lib/onboarding/personalisation'

export async function GET() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: profile, error } = await supabase
      .from('financial_profiles')
      .select('fact_find_data, profile_data')
      .eq('user_id', user.id)
      .single()

    if (error || !profile) {
      return NextResponse.json({ greeting: null })
    }

    const factFind = profile.fact_find_data as Record<string, unknown> | null
    const profileData = profile.profile_data as Record<string, unknown> | null
    const suggestedIntents = (factFind?.suggested_intents as string[]) ?? []

    if (factFind?.ai_greeting) {
      return NextResponse.json({
        greeting: factFind.ai_greeting as string,
        suggested_intents: suggestedIntents,
      })
    }

    const greetingData: OnboardingGreetingData = {
      age_bracket: (profileData?.age_bracket ?? factFind?.age_bracket) as string | undefined,
      household: profileData?.relationship_status as string | undefined,
      income_bracket: (profileData?.income_bracket ?? factFind?.income_bracket) as string | undefined,
      financial_confidence: (profileData?.financial_confidence ?? factFind?.financial_confidence) as string | undefined,
      priority_areas: (profileData?.priority_areas ?? factFind?.priority_areas) as string[] | undefined,
    }

    let greeting: string

    try {
      greeting = await generateAIGreeting(greetingData)
    } catch (aiError) {
      console.error('AI greeting generation failed, falling back to deterministic:', aiError)
      const fallback = generatePersonalisedGreeting(greetingData as Parameters<typeof generatePersonalisedGreeting>[0])
      greeting = fallback.greeting
    }

    await supabase
      .from('financial_profiles')
      .update({
        fact_find_data: {
          ...factFind,
          ai_greeting: greeting,
        },
      })
      .eq('user_id', user.id)

    return NextResponse.json({
      greeting,
      suggested_intents: suggestedIntents,
    })
  } catch (error) {
    console.error('Error in GET /api/profile/onboarding-greeting:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
