-- =============================================================================
-- Add DELETE RLS policies so users can remove their own data (reset flow)
-- =============================================================================

-- financial_profiles: user can delete their own row
CREATE POLICY "financial_profiles_delete_own" ON public.financial_profiles
  FOR DELETE USING (auth.uid() = user_id);

-- conversations: user can delete their own conversations
-- (messages cascade via ON DELETE CASCADE on conversation_id FK)
CREATE POLICY "conversations_delete_own" ON public.conversations
  FOR DELETE USING (auth.uid() = user_id);

-- messages: user can delete messages in their own conversations
CREATE POLICY "messages_delete_own" ON public.messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()
    )
  );

-- goals: user can delete their own goals
CREATE POLICY "goals_delete_own" ON public.goals
  FOR DELETE USING (auth.uid() = user_id);
