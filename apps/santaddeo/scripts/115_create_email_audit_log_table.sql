-- ============================================================================
-- Migration 115: email_audit_log
-- Audit log per email transazionali (signup, welcome, autopilot, recovery, ecc).
-- Separata dalla legacy email_logs (alert system, 200+ righe in prod) per
-- evitare conflitti di schema. Popolata da lib/email.ts > sendEmail.
-- Idempotente. RLS abilitata: SELECT solo super_admin, INSERT senza restrizione.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_audit_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Categoria: "signup_verify", "signup_welcome", "admin_new_user",
  -- "team_invite", "password_reset", "autopilot_notify", "test", ...
  email_type      TEXT NOT NULL,
  -- Destinatari (lista flat per facilitare query GIN)
  recipients      TEXT[] NOT NULL,
  -- Subject usato
  subject         TEXT,
  -- Esito: "sent" | "error" | "skipped" (es. dev mode senza TEST_EMAIL)
  status          TEXT NOT NULL,
  -- Provider SMTP usato (es. "smtp", "resend"). Per ora sempre "smtp".
  provider        TEXT NOT NULL DEFAULT 'smtp',
  -- Message-Id ritornato dal server SMTP (per match con bounce report)
  message_id      TEXT,
  -- Stringa errore quando status='error'
  error_message   TEXT,
  hotel_id        UUID REFERENCES public.hotels(id) ON DELETE SET NULL,
  user_id         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Metadata libera (es. {"source": "/api/auth/signup", "ip": "1.2.3.4"})
  metadata        JSONB DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.email_audit_log DROP CONSTRAINT IF EXISTS email_audit_log_status_check;
ALTER TABLE public.email_audit_log ADD CONSTRAINT email_audit_log_status_check CHECK (status IN ('sent', 'error', 'skipped'));

CREATE INDEX IF NOT EXISTS email_audit_log_type_idx       ON public.email_audit_log (email_type);
CREATE INDEX IF NOT EXISTS email_audit_log_status_idx     ON public.email_audit_log (status);
CREATE INDEX IF NOT EXISTS email_audit_log_created_at_idx ON public.email_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS email_audit_log_hotel_id_idx   ON public.email_audit_log (hotel_id) WHERE hotel_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS email_audit_log_user_id_idx    ON public.email_audit_log (user_id) WHERE user_id IS NOT NULL;

ALTER TABLE public.email_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_audit_log_super_admin_select ON public.email_audit_log;
CREATE POLICY email_audit_log_super_admin_select ON public.email_audit_log
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'super_admin'
    )
  );

DROP POLICY IF EXISTS email_audit_log_service_insert ON public.email_audit_log;
CREATE POLICY email_audit_log_service_insert ON public.email_audit_log
  FOR INSERT WITH CHECK (true);

COMMENT ON TABLE public.email_audit_log IS 'Audit log delle email transazionali (signup, autopilot, etc). Popolato da lib/email.ts. Solo super_admin puo leggere.';
