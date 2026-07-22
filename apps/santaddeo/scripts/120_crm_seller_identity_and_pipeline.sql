-- ============================================================================
-- CRM vendite: identita' mittente venditore + pipeline + timeline attivita'
-- Idempotente. Eseguibile via exec_sql (param `query`).
-- Progetto: SANTADDEO (NON Manubot).
-- ============================================================================

-- 1) sales_agents: indirizzo mittente personalizzato (@santaddeo.com)
ALTER TABLE public.sales_agents
  ADD COLUMN IF NOT EXISTS sender_email TEXT,   -- alias @santaddeo.com verificato in Workspace; NULL = fallback noreply
  ADD COLUMN IF NOT EXISTS sender_name  TEXT;   -- display name mittente (default = display_name)

-- 2) sales_leads: pipeline commerciale (separata dallo `status` automatico)
ALTER TABLE public.sales_leads
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS stage_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Vincolo stadi pipeline (drop+create per idempotenza)
ALTER TABLE public.sales_leads DROP CONSTRAINT IF EXISTS sales_leads_pipeline_stage_check;
ALTER TABLE public.sales_leads
  ADD CONSTRAINT sales_leads_pipeline_stage_check
  CHECK (pipeline_stage IN ('new','contacted','demo','negotiation','won','lost'));

CREATE INDEX IF NOT EXISTS idx_sales_leads_pipeline_stage ON public.sales_leads(pipeline_stage);

-- 3) sales_lead_activities: timeline unificata (note, call, email, cambi stadio, task)
CREATE TABLE IF NOT EXISTS public.sales_lead_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID NOT NULL REFERENCES public.sales_leads(id) ON DELETE CASCADE,
  sales_agent_id UUID REFERENCES public.sales_agents(id) ON DELETE SET NULL,
  -- chi ha generato l'attivita' (puo' essere il super admin)
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  activity_type TEXT NOT NULL
    CHECK (activity_type IN ('note','call','email_sent','email_received','stage_change','task')),
  content TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  due_at TIMESTAMPTZ,                 -- per task/promemoria
  completed_at TIMESTAMPTZ,           -- per task completati
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_lead_activities_lead ON public.sales_lead_activities(lead_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sales_lead_activities_type ON public.sales_lead_activities(activity_type);
CREATE INDEX IF NOT EXISTS idx_sales_lead_activities_due  ON public.sales_lead_activities(due_at) WHERE due_at IS NOT NULL;

-- RLS: coerente con le altre tabelle sales. Le query app usano service-role
-- (bypassa RLS) ma abilitiamo comunque la policy per accesso diretto.
ALTER TABLE public.sales_lead_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_lead_activities_select ON public.sales_lead_activities;
CREATE POLICY sales_lead_activities_select ON public.sales_lead_activities
  FOR SELECT USING (
    -- super admin vede tutto
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
    OR
    -- il venditore vede le attivita' dei propri lead
    EXISTS (
      SELECT 1 FROM public.sales_leads l
      JOIN public.sales_agents a ON a.id = l.sales_agent_id
      WHERE l.id = sales_lead_activities.lead_id AND a.user_id = auth.uid()
    )
  );
