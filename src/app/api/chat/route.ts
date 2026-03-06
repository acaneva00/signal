/**
 * POST /api/chat
 *
 * Single entry point for user messages. Authenticates, loads the minimal
 * profile slice, calls the orchestrator (Claude + tool loop + engine),
 * persists messages, and returns the result.
 *
 * Data minimisation: the full profile stays server-side. Only the field
 * *names* are sent to Claude initially; actual values flow through the
 * get_required_fields tool response for the classified intent only.
 */

import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { runChat } from '@/lib/chat/orchestrator';
import type { StructuredResponse } from '@/types/agent';

export async function POST(request: Request) {
  if (!process.env.ANTHROPIC_API_KEY) {
    return NextResponse.json(
      { error: 'Anthropic API key not configured' },
      { status: 500 },
    );
  }

  try {
    const supabase = await createClient();

    // ── Auth ──────────────────────────────────────────────────────────────
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Parse request ────────────────────────────────────────────────────
    const body = await request.json();
    const message: string | undefined = body.message;
    const structuredResponse: StructuredResponse | undefined = body.structured_response;

    if (!message || typeof message !== 'string') {
      return NextResponse.json(
        { error: 'message (string) is required' },
        { status: 400 },
      );
    }

    // ── Conversation (get or create) ─────────────────────────────────────
    const { data: conversations } = await supabase
      .from('conversations')
      .select('id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1);

    let conversationId: string;

    if (!conversations || conversations.length === 0) {
      const { data: newConv, error: createErr } = await supabase
        .from('conversations')
        .insert({ user_id: user.id })
        .select('id')
        .single();

      if (createErr || !newConv) {
        return NextResponse.json(
          { error: 'Failed to create conversation' },
          { status: 500 },
        );
      }
      conversationId = newConv.id;
    } else {
      conversationId = conversations[0].id;
    }

    // ── Financial profile ────────────────────────────────────────────────
    const { data: profile } = await supabase
      .from('financial_profiles')
      .select('profile_data')
      .eq('user_id', user.id)
      .single();

    let profileData: Record<string, unknown> = (profile?.profile_data as Record<string, unknown>) ?? {};

    // If the request carries a structured response, persist it first so the
    // orchestrator sees the freshest data.
    if (structuredResponse) {
      const { field, value } = structuredResponse;
      profileData = { ...profileData, [field]: value };

      if (profile) {
        await supabase
          .from('financial_profiles')
          .update({ profile_data: profileData })
          .eq('user_id', user.id);
      } else {
        await supabase.from('financial_profiles').insert({
          user_id: user.id,
          profile_data: profileData,
          self_assessments: {},
          engaged_domains: {},
          fact_find_data: {},
        });
      }
    }

    // ── Conversation history (last N messages) ───────────────────────────
    const { data: existingMessages } = await supabase
      .from('messages')
      .select('role, content')
      .eq('conversation_id', conversationId)
      .order('created_at', { ascending: true })
      .limit(20);

    const conversationHistory = (existingMessages ?? []).map((m) => ({
      role: m.role as 'user' | 'assistant',
      content: m.content as string,
    }));

    // ── Save user message ────────────────────────────────────────────────
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'user',
      content: message,
      channel: 'web',
      agent_used: null,
      intent_classified: null,
      canvas_state: null,
      enrichment_extracted: null,
      structured_response: structuredResponse ?? null,
    });

    // ── Run orchestrator ─────────────────────────────────────────────────
    const result = await runChat(message, profileData, conversationHistory);

    // ── Save assistant message ───────────────────────────────────────────
    await supabase.from('messages').insert({
      conversation_id: conversationId,
      role: 'assistant',
      content: result.message,
      channel: 'web',
      agent_used: result.agent_used,
      intent_classified: result.intent_classified,
      canvas_state: result.projection_summary ?? result.comparison_result ?? null,
      enrichment_extracted: null,
      input_request: result.input_request,
    });

    // ── Response ─────────────────────────────────────────────────────────
    return NextResponse.json({
      message: result.message,
      agent_used: result.agent_used,
      intent_classified: result.intent_classified,
      projection_result: result.projection_result,
      projection_summary: result.projection_summary,
      comparison_result: result.comparison_result,
      assumptions: result.assumptions,
      disclaimers: result.disclaimers,
      input_request: result.input_request,
    });
  } catch (error) {
    console.error('Error in POST /api/chat:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    );
  }
}
