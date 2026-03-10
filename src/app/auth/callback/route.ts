import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { convertPreLoginSession } from '@/lib/onboarding/conversion'

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/chat'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const {
        data: { user },
      } = await supabase.auth.getUser()

      const cookieStore = await cookies()
      const quizSessionId = cookieStore.get('signal_quiz_session')?.value

      if (user && quizSessionId) {
        try {
          await convertPreLoginSession(user.id, quizSessionId)
        } catch (err) {
          console.error('Quiz session conversion failed:', err)
        }
      }

      const forwardedHost = request.headers.get('x-forwarded-host')
      const isLocalEnv = process.env.NODE_ENV === 'development'

      let redirectUrl: string
      if (isLocalEnv) {
        redirectUrl = `${origin}${next}`
      } else if (forwardedHost) {
        redirectUrl = `https://${forwardedHost}${next}`
      } else {
        redirectUrl = `${origin}${next}`
      }

      const response = NextResponse.redirect(redirectUrl)

      if (quizSessionId) {
        response.cookies.set('signal_quiz_session', '', {
          httpOnly: false,
          secure: process.env.NODE_ENV === 'production',
          sameSite: 'lax',
          maxAge: 0,
          path: '/',
        })
      }

      return response
    }
  }

  return NextResponse.redirect(`${origin}/login?error=Could not authenticate user`)
}
