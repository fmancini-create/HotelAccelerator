-- Add rich-text HTML signature column to admin_users.
-- Sanitized server-side before insert/update (see lib/html-sanitize.ts).
-- The legacy `signature` TEXT column is kept as plain-text fallback, derived from signature_html on save.

ALTER TABLE public.admin_users
  ADD COLUMN IF NOT EXISTS signature_html text;

COMMENT ON COLUMN public.admin_users.signature_html IS
  'Rich-text HTML signature (sanitized). Used when rendering emails in HTML. Plain-text fallback lives in signature.';
