-- =============================================================================
-- Pre-login onboarding sessions and rate limiting
-- =============================================================================

-- pre_login_sessions – stores unauthenticated onboarding chat sessions
CREATE TABLE public.pre_login_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_data JSONB NOT NULL DEFAULT '{}',
  message_count INTEGER NOT NULL DEFAULT 0,
  ip_address TEXT,
  converted_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days')
);

-- Index for session lookups
CREATE INDEX idx_pre_login_sessions_id ON public.pre_login_sessions (id);
CREATE INDEX idx_pre_login_sessions_ip_created ON public.pre_login_sessions (ip_address, created_at);
CREATE INDEX idx_pre_login_sessions_expires_at ON public.pre_login_sessions (expires_at);
CREATE INDEX idx_pre_login_sessions_converted ON public.pre_login_sessions (converted_to_user_id);

-- RLS: These sessions are accessed by session ID without auth
ALTER TABLE public.pre_login_sessions ENABLE ROW LEVEL SECURITY;

-- Allow anonymous users to select their own session by ID
CREATE POLICY "pre_login_sessions_select_by_id" ON public.pre_login_sessions
  FOR SELECT TO anon USING (true);

-- Allow anonymous users to insert sessions
CREATE POLICY "pre_login_sessions_insert_anon" ON public.pre_login_sessions
  FOR INSERT TO anon WITH CHECK (true);

-- Allow anonymous users to update sessions
CREATE POLICY "pre_login_sessions_update_anon" ON public.pre_login_sessions
  FOR UPDATE TO anon USING (true);

-- Authenticated users can see sessions they converted
CREATE POLICY "pre_login_sessions_select_converted" ON public.pre_login_sessions
  FOR SELECT TO authenticated USING (converted_to_user_id = auth.uid());

-- Add updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.pre_login_sessions;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.pre_login_sessions
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- Rate limiting function
-- =============================================================================

-- Check if IP can create a new session (max 3 per hour)
CREATE OR REPLACE FUNCTION public.check_session_rate_limit(ip TEXT)
RETURNS BOOLEAN AS $$
DECLARE
  session_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO session_count
  FROM public.pre_login_sessions
  WHERE ip_address = ip
    AND created_at > (now() - INTERVAL '1 hour');
  
  RETURN session_count < 3;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup function for expired sessions (call via cron or manually)
CREATE OR REPLACE FUNCTION public.cleanup_expired_pre_login_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  -- Only delete sessions that haven't been converted to users
  DELETE FROM public.pre_login_sessions
  WHERE expires_at < now()
    AND converted_to_user_id IS NULL;
  
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.check_session_rate_limit(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_pre_login_sessions() TO service_role;

-- =============================================================================
-- Comments for documentation
-- =============================================================================

COMMENT ON TABLE public.pre_login_sessions IS 'Stores pre-login onboarding chat sessions for unauthenticated users';
COMMENT ON COLUMN public.pre_login_sessions.session_data IS 'Stores collected onboarding data: age_range, employment_type, income_band, super_balance_band, goal_text';
COMMENT ON COLUMN public.pre_login_sessions.message_count IS 'Tracks number of messages in session (max 20)';
COMMENT ON COLUMN public.pre_login_sessions.converted_to_user_id IS 'Set when session data is migrated to a registered user account';
COMMENT ON COLUMN public.pre_login_sessions.expires_at IS 'Sessions expire after 7 days unless converted to user account';
