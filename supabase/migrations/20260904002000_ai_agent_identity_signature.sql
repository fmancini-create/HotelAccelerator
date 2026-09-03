-- Tenant-scoped identity for the virtual AI operator.
--
-- `ai_agent_settings` already owns tenant-level AI settings. We extend that
-- record instead of creating a fake `admin_users` row: admin_users is tied to
-- Supabase Auth identities, while the AI agent must never be able to log in.
--
-- A missing row is valid. Application code resolves the same defaults lazily,
-- so existing and newly-created tenants immediately have an AI identity without
-- a provisioning trigger or a mass insert.

ALTER TABLE public.ai_agent_settings
  ADD COLUMN IF NOT EXISTS display_name text NOT NULL DEFAULT 'Sofia',
  ADD COLUMN IF NOT EXISTS signature_html text;

COMMENT ON COLUMN public.ai_agent_settings.display_name IS
  'Display name of the tenant virtual AI operator. This is not an auth identity.';

COMMENT ON COLUMN public.ai_agent_settings.signature_html IS
  'Optional sanitized custom email signature for the tenant virtual AI operator. NULL uses the generated default signature.';
