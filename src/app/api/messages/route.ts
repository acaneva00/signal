import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { StructuredResponse, InputRequest } from '@/types/agent'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get or create conversation for this user
    let { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (convError) {
      return NextResponse.json(
        { error: 'Failed to fetch conversation' },
        { status: 500 }
      )
    }

    let conversationId: string

    if (!conversations || conversations.length === 0) {
      // Create new conversation
      const { data: newConv, error: createError } = await supabase
        .from('conversations')
        .insert({
          user_id: user.id,
          active_program: null,
          program_step: null,
        })
        .select('id')
        .single()

      if (createError || !newConv) {
        return NextResponse.json(
          { error: 'Failed to create conversation' },
          { status: 500 }
        )
      }

      conversationId = newConv.id
    } else {
      conversationId = conversations[0].id
    }

    // Parse request body
    const { content, role, structured_response, input_request } = await request.json()

    if (!content || !role) {
      return NextResponse.json(
        { error: 'Content and role are required' },
        { status: 400 }
      )
    }

    // If structured_response is present (user message), update financial_profiles
    if (structured_response && role === 'user') {
      const { field, value } = structured_response as StructuredResponse

      // Get or create financial profile
      let { data: profiles, error: profileError } = await supabase
        .from('financial_profiles')
        .select('id, profile_data')
        .eq('user_id', user.id)
        .single()

      if (profileError && profileError.code !== 'PGRST116') {
        // PGRST116 is "not found" error, which is okay
        return NextResponse.json(
          { error: 'Failed to fetch financial profile' },
          { status: 500 }
        )
      }

      if (!profiles) {
        // Create new financial profile
        const { error: createProfileError } = await supabase
          .from('financial_profiles')
          .insert({
            user_id: user.id,
            profile_data: { [field]: value },
            self_assessments: {},
            engaged_domains: {},
            fact_find_data: {},
          })

        if (createProfileError) {
          return NextResponse.json(
            { error: 'Failed to create financial profile' },
            { status: 500 }
          )
        }
      } else {
        // Update existing profile with new field value
        const currentProfileData = profiles.profile_data || {}
        const updatedProfileData = {
          ...currentProfileData,
          [field]: value,
        }

        const { error: updateProfileError } = await supabase
          .from('financial_profiles')
          .update({ profile_data: updatedProfileData })
          .eq('user_id', user.id)

        if (updateProfileError) {
          return NextResponse.json(
            { error: 'Failed to update financial profile' },
            { status: 500 }
          )
        }
      }
    }

    // Insert message with channel and optional structured fields
    const messageData: any = {
      conversation_id: conversationId,
      role,
      content,
      channel: 'web',
      agent_used: null,
      intent_classified: null,
      canvas_state: null,
      enrichment_extracted: null,
    }

    // Add structured_response if present (user message)
    if (structured_response && role === 'user') {
      messageData.structured_response = structured_response
    }

    // Add input_request if present (assistant message)
    if (input_request && role === 'assistant') {
      messageData.input_request = input_request
    }

    const { data: message, error: messageError } = await supabase
      .from('messages')
      .insert(messageData)
      .select()
      .single()

    if (messageError || !message) {
      return NextResponse.json(
        { error: 'Failed to save message' },
        { status: 500 }
      )
    }

    return NextResponse.json({ message })
  } catch (error) {
    console.error('Error in POST /api/messages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: Request) {
  try {
    const supabase = await createClient()
    
    // Check authentication
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get user's conversation
    const { data: conversations, error: convError } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)

    if (convError) {
      return NextResponse.json(
        { error: 'Failed to fetch conversation' },
        { status: 500 }
      )
    }

    if (!conversations || conversations.length === 0) {
      return NextResponse.json({ messages: [] })
    }

    const conversationId = conversations[0].id

    // Fetch messages
    const { data: messages, error: messagesError } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })

    if (messagesError) {
      return NextResponse.json(
        { error: 'Failed to fetch messages' },
        { status: 500 }
      )
    }

    return NextResponse.json({ messages: messages || [] })
  } catch (error) {
    console.error('Error in GET /api/messages:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
