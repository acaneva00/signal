-- =============================================================================
-- Signal: Core schema – tables, RLS, indexes
-- Run in Supabase SQL Editor. Tables marked [V2] are created but not populated.
-- All user-data tables have RLS; products/knowledge_chunks are public read.
-- =============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "vector";

-- =============================================================================
-- 14.1 Core Tables
-- =============================================================================

-- users – Confidential / Restricted
-- Row is created by trigger from auth.users; id matches auth.uid().
CREATE TABLE public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  display_name TEXT,
  subscription_tier TEXT,
  profile_completeness NUMERIC(5,2),
  mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_select_own" ON public.users
  FOR SELECT USING (auth.uid() = id);
CREATE POLICY "users_insert_own" ON public.users
  FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "users_update_own" ON public.users
  FOR UPDATE USING (auth.uid() = id);

CREATE UNIQUE INDEX idx_users_email ON public.users (email);
CREATE INDEX idx_users_subscription_tier ON public.users (subscription_tier);

-- Sync auth.users → public.users (use auth user's ID)
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.users (id, email, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.email, ''),
    COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'full_name', NULL)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- financial_profiles – Restricted
CREATE TABLE public.financial_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  profile_data JSONB,
  self_assessments JSONB,
  engaged_domains JSONB,
  fact_find_data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.financial_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "financial_profiles_select_own" ON public.financial_profiles
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "financial_profiles_insert_own" ON public.financial_profiles
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "financial_profiles_update_own" ON public.financial_profiles
  FOR UPDATE USING (auth.uid() = user_id);

CREATE UNIQUE INDEX idx_financial_profiles_user_id ON public.financial_profiles (user_id);

-- conversations – Confidential
CREATE TABLE public.conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  active_program TEXT,
  program_step TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations_select_own" ON public.conversations
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "conversations_insert_own" ON public.conversations
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "conversations_update_own" ON public.conversations
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_conversations_user_id ON public.conversations (user_id);
CREATE INDEX idx_conversations_active_program ON public.conversations (active_program);

-- messages – Confidential
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES public.conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  content TEXT,
  agent_used TEXT,
  intent_classified TEXT,
  canvas_state JSONB,
  enrichment_extracted JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: users can only access messages for their own conversations
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "messages_select_own" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY "messages_insert_own" ON public.messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()
    )
  );
CREATE POLICY "messages_update_own" ON public.messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = messages.conversation_id AND c.user_id = auth.uid()
    )
  );

CREATE INDEX idx_messages_conversation_id ON public.messages (conversation_id);
CREATE INDEX idx_messages_created_at ON public.messages (conversation_id, created_at);
CREATE INDEX idx_messages_intent_classified ON public.messages (intent_classified);

-- products – Public (read by all; write via service_role only)
CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_type TEXT NOT NULL,
  name TEXT NOT NULL,
  aliases TEXT[],
  provider TEXT,
  fee_structure JSONB,
  investment_options JSONB,
  data_as_at DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

CREATE POLICY "products_select_public" ON public.products
  FOR SELECT TO anon, authenticated USING (true);
-- No INSERT/UPDATE policies: only service_role (bypass RLS) can write

CREATE INDEX idx_products_product_type ON public.products (product_type);
CREATE INDEX idx_products_provider ON public.products (provider);
CREATE INDEX idx_products_name ON public.products (name);

-- goals – Confidential
CREATE TABLE public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  goal_text TEXT NOT NULL,
  decomposition JSONB,
  status TEXT NOT NULL,
  progress NUMERIC(5,2),
  check_in_frequency TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "goals_select_own" ON public.goals
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "goals_insert_own" ON public.goals
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "goals_update_own" ON public.goals
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_goals_user_id ON public.goals (user_id);
CREATE INDEX idx_goals_status ON public.goals (status);

-- coaching_events – Confidential
CREATE TABLE public.coaching_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  data JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.coaching_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "coaching_events_select_own" ON public.coaching_events
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "coaching_events_insert_own" ON public.coaching_events
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "coaching_events_update_own" ON public.coaching_events
  FOR UPDATE USING (auth.uid() = user_id);

CREATE INDEX idx_coaching_events_user_id ON public.coaching_events (user_id);
CREATE INDEX idx_coaching_events_event_type ON public.coaching_events (event_type);
CREATE INDEX idx_coaching_events_created_at ON public.coaching_events (created_at);

-- knowledge_chunks – Public (read by all; write via service_role only)
CREATE TABLE public.knowledge_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  embedding VECTOR(1536),
  source TEXT,
  source_type TEXT,
  topic_tags TEXT[],
  domain_relevance JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "knowledge_chunks_select_public" ON public.knowledge_chunks
  FOR SELECT TO anon, authenticated USING (true);
-- No INSERT/UPDATE policies: only service_role can write

CREATE INDEX idx_knowledge_chunks_source ON public.knowledge_chunks (source);
CREATE INDEX idx_knowledge_chunks_source_type ON public.knowledge_chunks (source_type);
-- Vector index: 1536 = OpenAI text-embedding-ada-002; adjust dimension if using another model.
-- Build after table has data for better ivfflat clustering (or use CREATE INDEX CONCURRENTLY later).
CREATE INDEX idx_knowledge_chunks_embedding ON public.knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- =============================================================================
-- 14.2 Governance & Audit Tables
-- =============================================================================

-- governance_config – Internal (public read, service_role update only)
CREATE TABLE public.governance_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  advice_level_permitted INTEGER NOT NULL DEFAULT 0,
  advice_detection_rules JSONB,
  product_categories_in_scope TEXT[],
  requires_human_review BOOLEAN NOT NULL DEFAULT false,
  disclaimer_templates JSONB,
  escalation_behaviour JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.governance_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "governance_config_select_public" ON public.governance_config
  FOR SELECT TO anon, authenticated USING (true);
-- No UPDATE policy for anon/authenticated: only service_role can update

-- audit_log – PRD Section 10.2 governance audit; immutable, append-only; 7-year retention
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID,
  session_id UUID,
  message_id UUID,
  agent_used TEXT,
  intent_classified TEXT,
  advice_classification TEXT,
  governance_action TEXT NOT NULL,
  disclaimer_added BOOLEAN,
  assumptions_listed JSONB,
  client_circumstances_snapshot JSONB,
  basis_for_recommendation TEXT,
  adviser_review_status TEXT,
  response_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "audit_log_insert" ON public.audit_log
  FOR INSERT TO authenticated WITH CHECK (true);
-- No SELECT/UPDATE/DELETE policies: access only via service_role or dedicated role

CREATE INDEX idx_audit_log_actor_id ON public.audit_log (actor_id);
CREATE INDEX idx_audit_log_governance_action ON public.audit_log (governance_action);
CREATE INDEX idx_audit_log_created_at ON public.audit_log (created_at);

-- =============================================================================
-- 14.3 Adviser & Relationship Tables [V2]
-- Tables created; RLS policies to be added later.
-- =============================================================================

-- practitioner_profiles [V2] – Restricted
CREATE TABLE public.practitioner_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  afsl_number TEXT,
  afsl_holder TEXT,
  authorisation_scope TEXT[],
  verified BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.practitioner_profiles ENABLE ROW LEVEL SECURITY;
-- Policies: to be added in V2

CREATE UNIQUE INDEX idx_practitioner_profiles_user_id ON public.practitioner_profiles (user_id);
CREATE INDEX idx_practitioner_profiles_afsl_number ON public.practitioner_profiles (afsl_number);

-- client_relationships [V2] – Restricted
CREATE TABLE public.client_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  practitioner_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  relationship_type TEXT NOT NULL,
  consent_level TEXT,
  consent_granted_at TIMESTAMPTZ,
  referral_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT client_relationships_unique UNIQUE (client_user_id, practitioner_id)
);

ALTER TABLE public.client_relationships ENABLE ROW LEVEL SECURITY;
-- Policies: to be added in V2

CREATE INDEX idx_client_relationships_client_user_id ON public.client_relationships (client_user_id);
CREATE INDEX idx_client_relationships_practitioner_id ON public.client_relationships (practitioner_id);
CREATE INDEX idx_client_relationships_relationship_type ON public.client_relationships (relationship_type);

-- =============================================================================
-- Optional: updated_at trigger (for tables that have updated_at)
-- =============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  t TEXT;
BEGIN
  FOR t IN
    SELECT unnest(ARRAY[
      'users', 'financial_profiles', 'conversations', 'products',
      'goals', 'knowledge_chunks', 'governance_config',
      'practitioner_profiles', 'client_relationships'
    ])
  LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS set_updated_at ON public.%I;
       CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t
    );
  END LOOP;
END;
$$;
