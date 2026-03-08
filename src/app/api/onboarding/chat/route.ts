import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { InputRequest } from '@/types/agent'
import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
})

// Question sequence configuration
const QUESTIONS = {
  age_range: {
    order: 1,
    text: "Hey! I'm Signal — your financial companion. To get started, how old are you?",
    type: 'chips' as const,
    options: [
      { label: '18–25', value: '18-25' },
      { label: '26–35', value: '26-35' },
      { label: '36–45', value: '36-45' },
      { label: '46–55', value: '46-55' },
      { label: '56–65', value: '56-65' },
      { label: '65+', value: '65+' },
    ],
    acknowledgements: [
      "Great — that helps me calibrate things for you.",
    ],
  },
  employment_type: {
    order: 2,
    text: "Nice. And what's your work situation?",
    type: 'chips' as const,
    options: [
      { label: 'Full-time employed', value: 'full_time' },
      { label: 'Part-time/casual', value: 'part_time' },
      { label: 'Self-employed', value: 'self_employed' },
      { label: 'Not working', value: 'not_working' },
      { label: 'Retired', value: 'retired' },
    ],
    acknowledgements: [
      "Got it. That affects a few things like super contributions and tax offsets.",
    ],
  },
  income_band: {
    order: 3,
    text: "Roughly what's your annual income before tax?",
    type: 'chips' as const,
    options: [
      { label: 'Under $45K', value: 'under_45k' },
      { label: '$45K–$90K', value: '45k_90k' },
      { label: '$90K–$135K', value: '90k_135k' },
      { label: '$135K–$200K', value: '135k_200k' },
      { label: '$200K+', value: '200k_plus' },
    ],
    acknowledgements: [
      "Thanks — that's one of the most important inputs for projections.",
    ],
  },
  super_balance_band: {
    order: 4,
    text: "Do you know roughly what your super balance is?",
    type: 'chips' as const,
    options: [
      { label: 'Under $50K', value: 'under_50k' },
      { label: '$50K–$150K', value: '50k_150k' },
      { label: '$150K–$400K', value: '150k_400k' },
      { label: '$400K–$800K', value: '400k_800k' },
      { label: '$800K+', value: '800k_plus' },
      { label: 'No idea', value: 'no_idea' },
    ],
    acknowledgements: [
      "Perfect. Even a rough number is really useful.",
      "No worries — lots of people don't. I'll use some reasonable estimates and we can refine later.",
    ],
    conditionalAcknowledgement: (value: string) => {
      return value === 'no_idea' ? 1 : 0 // Index of acknowledgement to use
    },
  },
  goal_text: {
    order: 5,
    text: "Last one — what's the money question that's on your mind?",
    type: 'free_text' as const,
    field: 'goal_text',
  },
}

// Get client IP address
function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIp = request.headers.get('x-real-ip')
  
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  if (realIp) {
    return realIp
  }
  
  return 'unknown'
}

// Get the next question based on collected data
function getNextQuestion(sessionData: Record<string, any>): {
  field: string
  question: any
} | null {
  const fields = Object.keys(QUESTIONS)
  
  for (const field of fields) {
    if (!sessionData[field]) {
      return { field, question: QUESTIONS[field as keyof typeof QUESTIONS] }
    }
  }
  
  return null // All questions answered
}

// Get acknowledgement for a response
function getAcknowledgement(field: string, value: string): string {
  const question = QUESTIONS[field as keyof typeof QUESTIONS] as Record<string, any>

  if (question.conditionalAcknowledgement) {
    const index = question.conditionalAcknowledgement(value)
    return question.acknowledgements[index]
  }

  if (question.acknowledgements) {
    const index = Math.floor(Math.random() * question.acknowledgements.length)
    return question.acknowledgements[index]
  }

  return "Thanks!"
}

// Create InputRequest for a question (returns null for free-text fields)
function createInputRequest(field: string, question: any): InputRequest | null {
  if (question.type === 'free_text') return null

  return {
    type: question.type,
    field,
    required: true,
    options: question.options?.map((opt: any) => ({
      label: opt.label,
      value: opt.value,
    })),
  }
}

// Generate lightweight projection using Claude
async function generateProjection(sessionData: Record<string, any>): Promise<string> {
  const { age_range, employment_type, income_band, super_balance_band, goal_text } = sessionData
  
  const prompt = `You are Signal, a friendly Australian financial companion. A new user has just completed onboarding with the following information:

Age: ${age_range}
Employment: ${employment_type}
Income: ${income_band}
Super balance: ${super_balance_band}
Goal: ${goal_text}

Generate a brief, warm, and insightful projection response (2-3 paragraphs) that:
1. Acknowledges their specific goal
2. Provides a high-level insight based on their financial situation
3. Creates excitement about what they can achieve
4. Ends with a clear call-to-action to sign up to explore further

Keep it conversational, specific to their inputs, and avoid generic advice. Make them feel like you understand their unique situation.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })
    
    const textContent = message.content.find((block) => block.type === 'text')
    return textContent ? textContent.text : "Thanks for sharing! Let's explore your financial future together. Sign up to get your personalized projection and ongoing guidance."
  } catch (error) {
    console.error('Error generating projection:', error)
    return "Thanks for sharing! Based on what you've told me, I can help you map out a clear path forward. Sign up to get your personalized projection and ongoing guidance."
  }
}

// Generate acknowledgement for goal using Claude
async function generateGoalAcknowledgement(goalText: string): Promise<string> {
  const prompt = `You are Signal, a friendly Australian financial companion. A user just shared their money goal: "${goalText}"

Generate a brief (1-2 sentences), warm acknowledgement that shows you understand their goal. Be specific to what they said, not generic. Keep it conversational and encouraging.`

  try {
    const message = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 256,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    })
    
    const textContent = message.content.find((block) => block.type === 'text')
    return textContent ? textContent.text : "That's a great goal to work towards."
  } catch (error) {
    console.error('Error generating goal acknowledgement:', error)
    return "That's a great goal to work towards."
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const clientIp = getClientIp(request)
    
    // Get session ID from cookie
    const cookies = request.headers.get('cookie') || ''
    const sessionIdMatch = cookies.match(/pre_login_session_id=([^;]+)/)
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null
    
    let session: any = null
    let isNewSession = false
    
    // If no session ID, create new session
    if (!sessionId) {
      // Check rate limit
      const { data: canCreate, error: rateLimitError } = await supabase
        .rpc('check_session_rate_limit', { ip: clientIp })
      
      if (rateLimitError) {
        console.error('Rate limit check error:', rateLimitError)
        return NextResponse.json(
          { error: 'Service temporarily unavailable' },
          { status: 503 }
        )
      }
      
      if (!canCreate) {
        return NextResponse.json(
          { error: 'Too many sessions created. Please try again later.' },
          { status: 429 }
        )
      }
      
      // Create new session
      const { data: newSession, error: createError } = await supabase
        .from('pre_login_sessions')
        .insert({
          session_data: {},
          message_count: 1,
          ip_address: clientIp,
        })
        .select()
        .single()
      
      if (createError || !newSession) {
        console.error('Session creation error:', createError)
        return NextResponse.json(
          { error: 'Failed to create session' },
          { status: 500 }
        )
      }
      
      session = newSession
      isNewSession = true
      
      // Return first question with Set-Cookie header
      const inputRequest = createInputRequest('age_range', QUESTIONS.age_range)
      
      const response = NextResponse.json({
        message: {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: QUESTIONS.age_range.text,
          ...(inputRequest && { input_request: inputRequest }),
          created_at: new Date().toISOString(),
        },
      })
      
      // Set httpOnly cookie (7 days expiry)
      response.cookies.set('pre_login_session_id', session.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7, // 7 days
        path: '/',
      })
      
      return response
    }
    
    // Load existing session
    const { data: existingSession, error: sessionError } = await supabase
      .from('pre_login_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    
    if (sessionError || !existingSession) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      )
    }
    
    session = existingSession
    
    // Check message limit
    if (session.message_count >= 20) {
      return NextResponse.json(
        { error: 'Message limit reached for this session' },
        { status: 429 }
      )
    }
    
    // Parse user message
    const { content, structured_response } = await request.json()
    
    if (!content) {
      return NextResponse.json(
        { error: 'Content is required' },
        { status: 400 }
      )
    }
    
    // Update session data with user's response
    const sessionData = { ...session.session_data }
    
    if (structured_response) {
      const { field, value } = structured_response
      sessionData[field] = value
    }
    
    // Increment message count (user message + assistant response)
    const newMessageCount = session.message_count + 2
    
    // Update session
    const { error: updateError } = await supabase
      .from('pre_login_sessions')
      .update({
        session_data: sessionData,
        message_count: newMessageCount,
      })
      .eq('id', sessionId)
    
    if (updateError) {
      console.error('Session update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to update session' },
        { status: 500 }
      )
    }
    
    // Get acknowledgement for the response
    let acknowledgement = ''
    if (structured_response) {
      const { field, value } = structured_response
      
      // For goal_text, use Claude to generate acknowledgement
      if (field === 'goal_text') {
        acknowledgement = await generateGoalAcknowledgement(value)
      } else {
        acknowledgement = getAcknowledgement(field, value)
      }
    }
    
    // Check if all questions are answered
    const nextQuestion = getNextQuestion(sessionData)
    
    if (!nextQuestion) {
      // All questions answered - generate projection
      const projection = await generateProjection(sessionData)
      
      return NextResponse.json({
        message: {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `${acknowledgement}\n\n${projection}`,
          created_at: new Date().toISOString(),
        },
        completed: true,
      })
    }
    
    // Return next question
    const inputRequest = createInputRequest(nextQuestion.field, nextQuestion.question)
    
    return NextResponse.json({
      message: {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: `${acknowledgement}\n\n${nextQuestion.question.text}`,
        ...(inputRequest && { input_request: inputRequest }),
        created_at: new Date().toISOString(),
      },
    })
  } catch (error) {
    console.error('Error in POST /api/onboarding/chat:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

// GET endpoint to retrieve session data (for resuming)
export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    
    // Get session ID from cookie
    const cookies = request.headers.get('cookie') || ''
    const sessionIdMatch = cookies.match(/pre_login_session_id=([^;]+)/)
    const sessionId = sessionIdMatch ? sessionIdMatch[1] : null
    
    if (!sessionId) {
      return NextResponse.json(
        { error: 'No session found' },
        { status: 404 }
      )
    }
    
    // Load session
    const { data: session, error: sessionError } = await supabase
      .from('pre_login_sessions')
      .select('*')
      .eq('id', sessionId)
      .single()
    
    if (sessionError || !session) {
      return NextResponse.json(
        { error: 'Session not found or expired' },
        { status: 404 }
      )
    }
    
    // Determine current state
    const nextQuestion = getNextQuestion(session.session_data)
    
    return NextResponse.json({
      session_data: session.session_data,
      message_count: session.message_count,
      next_question: nextQuestion ? nextQuestion.field : null,
      completed: !nextQuestion,
    })
  } catch (error) {
    console.error('Error in GET /api/onboarding/chat:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
