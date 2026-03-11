-- NOTE: This migration must be applied manually via the Supabase SQL Editor
-- or via `npx supabase db push` after running `npx supabase login && npx supabase link`.
-- The exec_sql RPC does not exist on this project, and the service role key
-- cannot execute DDL through the REST API. The seed script (products.seed.ts)
-- uses upsert with onConflict:'name' which will work as INSERT when the table
-- is empty, but this constraint is required for idempotent re-runs.

ALTER TABLE public.products ADD CONSTRAINT products_name_unique UNIQUE (name);
