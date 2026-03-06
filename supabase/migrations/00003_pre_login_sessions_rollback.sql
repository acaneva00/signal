-- =============================================================================
-- Rollback for 00003_pre_login_sessions.sql
-- Run this if you need to undo the pre-login sessions feature
-- =============================================================================

-- Drop RLS policies
DROP POLICY IF EXISTS "pre_login_sessions_select_converted" ON public.pre_login_sessions;
DROP POLICY IF EXISTS "pre_login_sessions_update_anon" ON public.pre_login_sessions;
DROP POLICY IF EXISTS "pre_login_sessions_insert_anon" ON public.pre_login_sessions;
DROP POLICY IF EXISTS "pre_login_sessions_select_by_id" ON public.pre_login_sessions;

-- Drop functions
DROP FUNCTION IF EXISTS public.cleanup_expired_pre_login_sessions();
DROP FUNCTION IF EXISTS public.check_session_rate_limit(TEXT);

-- Drop trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.pre_login_sessions;

-- Drop table (CASCADE will drop all dependent objects)
DROP TABLE IF EXISTS public.pre_login_sessions CASCADE;

-- Verify cleanup
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename = 'pre_login_sessions'
  ) THEN
    RAISE EXCEPTION 'Failed to drop pre_login_sessions table';
  END IF;
  
  RAISE NOTICE 'Successfully rolled back pre-login sessions feature';
END $$;
