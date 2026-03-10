import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { generatePersonalisedGreeting } from '@/lib/onboarding/personalisation'
import type { QuizSessionData } from '@/lib/onboarding/personalisation'

function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  if (forwarded) return forwarded.split(',')[0].trim()
  if (realIp) return realIp
  return 'unknown'
}

interface CreateBody {
  action: 'create'
}

interface SaveBody {
  action: 'save'
  session_id: string
  field: string
  value: string | string[]
}

interface CompleteBody {
  action: 'complete'
  session_id: string
}

type RequestBody = CreateBody | SaveBody | CompleteBody

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as RequestBody
    const supabase = await createClient()

    if (body.action === 'create') {
      const clientIp = getClientIp(request)

      const { data: canCreate, error: rateLimitError } = await supabase.rpc(
        'check_session_rate_limit',
        { ip: clientIp },
      )

      if (rateLimitError) {
        console.error('Rate limit check error (non-blocking):', rateLimitError)
      }

      if (!rateLimitError && !canCreate) {
        return NextResponse.json(
          { error: 'Too many sessions created. Please try again later.' },
          { status: 429 },
        )
      }

      const { data: session, error: createError } = await supabase
        .from('pre_login_sessions')
        .insert({ session_data: {}, message_count: 0, ip_address: clientIp })
        .select('id')
        .single()

      if (createError || !session) {
        console.error('Session creation error:', createError)
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
      }

      const response = NextResponse.json({ session_id: session.id })
      response.cookies.set('signal_quiz_session', session.id, {
        httpOnly: false,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
        path: '/',
      })
      return response
    }

    if (body.action === 'save') {
      const { session_id, field, value } = body
      if (!session_id || !field) {
        return NextResponse.json({ error: 'session_id and field are required' }, { status: 400 })
      }

      const { data: existing, error: fetchError } = await supabase
        .from('pre_login_sessions')
        .select('session_data')
        .eq('id', session_id)
        .single()

      if (fetchError || !existing) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }

      const merged = { ...(existing.session_data as Record<string, unknown>), [field]: value }

      const { error: updateError } = await supabase
        .from('pre_login_sessions')
        .update({ session_data: merged })
        .eq('id', session_id)

      if (updateError) {
        console.error('Session save error:', updateError)
        return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
      }

      return NextResponse.json({ ok: true })
    }

    if (body.action === 'complete') {
      const { session_id } = body
      if (!session_id) {
        return NextResponse.json({ error: 'session_id is required' }, { status: 400 })
      }

      const { data: session, error: fetchError } = await supabase
        .from('pre_login_sessions')
        .select('session_data')
        .eq('id', session_id)
        .single()

      if (fetchError || !session) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 })
      }

      const sessionData = session.session_data as QuizSessionData
      const { greeting, suggested_intents } = generatePersonalisedGreeting(sessionData)

      const merged = {
        ...(session.session_data as Record<string, unknown>),
        personalised_greeting: greeting,
        suggested_intents,
      }

      const { error: updateError } = await supabase
        .from('pre_login_sessions')
        .update({ session_data: merged })
        .eq('id', session_id)

      if (updateError) {
        console.error('Session complete error:', updateError)
        return NextResponse.json({ error: 'Failed to complete' }, { status: 500 })
      }

      return NextResponse.json({ ok: true, greeting, suggested_intents })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Error in POST /api/onboarding/quiz:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
