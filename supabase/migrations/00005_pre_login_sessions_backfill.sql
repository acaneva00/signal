-- =============================================================================
-- Backfill: bring pre_login_sessions up to the 00003 migration spec
-- Safe to run if columns/functions already exist.
-- =============================================================================

-- Add missing columns (no-op if they already exist)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pre_login_sessions'
      AND column_name = 'ip_address'
  ) THEN
    ALTER TABLE public.pre_login_sessions ADD COLUMN ip_address TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pre_login_sessions'
      AND column_name = 'expires_at'
  ) THEN
    ALTER TABLE public.pre_login_sessions
      ADD COLUMN expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pre_login_sessions'
      AND column_name = 'converted_to_user_id'
  ) THEN
    ALTER TABLE public.pre_login_sessions
      ADD COLUMN converted_to_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Add missing indexes (no-op if they already exist)
CREATE INDEX IF NOT EXISTS idx_pre_login_sessions_ip_created
  ON public.pre_login_sessions (ip_address, created_at);

CREATE INDEX IF NOT EXISTS idx_pre_login_sessions_expires_at
  ON public.pre_login_sessions (expires_at);

CREATE INDEX IF NOT EXISTS idx_pre_login_sessions_converted
  ON public.pre_login_sessions (converted_to_user_id);

-- Rate limiting function (CREATE OR REPLACE is inherently idempotent)
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

-- Cleanup function for expired sessions
CREATE OR REPLACE FUNCTION public.cleanup_expired_pre_login_sessions()
RETURNS INTEGER AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
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
