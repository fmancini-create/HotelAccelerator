-- ============================================================================
-- 117_create_sales_agent_calendars.sql
--
-- Calendari personali dei venditori (overlay nel calendario /sales/calendar).
--
-- Ogni venditore puo' collegare uno o piu' calendari personali (Google,
-- Outlook/Microsoft 365, Apple iCloud o altro) tramite il loro URL SEGRETO
-- ICS (formato iCalendar, sola lettura). Gli eventi vengono mostrati come
-- overlay nel calendario venditori, accanto alle demo su clienti@4bid.it.
--
-- SOLA LETTURA: la piattaforma non scrive mai su questi calendari.
-- L'ics_url contiene un segreto -> non viene mai riesposto al client dopo il
-- salvataggio (le API ritornano solo metadati).
--
-- Idempotente: CREATE TABLE/INDEX IF NOT EXISTS.
-- Convenzione FK allineata al resto del CRM: `sales_agent_id`.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.sales_agent_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_agent_id UUID NOT NULL REFERENCES public.sales_agents(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'other'
    CHECK (provider IN ('google', 'outlook', 'apple', 'other')),
  ics_url TEXT NOT NULL,                         -- URL segreto ICS (sola lettura)
  label TEXT,                                    -- nome scelto dal venditore
  color TEXT NOT NULL DEFAULT '#a855f7',         -- colore overlay (hex)
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  last_synced_at TIMESTAMPTZ,                    -- ultimo fetch riuscito
  last_error TEXT,                               -- ultimo errore di fetch (se presente)
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Un venditore non puo' aggiungere due volte lo stesso URL.
  UNIQUE(sales_agent_id, ics_url)
);

CREATE INDEX IF NOT EXISTS idx_sales_agent_calendars_agent
  ON public.sales_agent_calendars(sales_agent_id);
CREATE INDEX IF NOT EXISTS idx_sales_agent_calendars_active
  ON public.sales_agent_calendars(is_active);


-- ===========================================================================
-- Trigger updated_at (riusa la funzione comune public.set_updated_at)
-- ===========================================================================
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'set_updated_at'
  ) THEN
    DROP TRIGGER IF EXISTS trg_sales_agent_calendars_updated_at ON public.sales_agent_calendars;
    CREATE TRIGGER trg_sales_agent_calendars_updated_at
      BEFORE UPDATE ON public.sales_agent_calendars
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;


-- ===========================================================================
-- RLS: il venditore accede solo ai propri calendari; super_admin vede tutto.
-- Le API usano comunque il service-role, ma teniamo la RLS coerente col CRM.
-- ===========================================================================
ALTER TABLE public.sales_agent_calendars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sales_agent_calendars_select ON public.sales_agent_calendars;
CREATE POLICY sales_agent_calendars_select ON public.sales_agent_calendars
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sales_agents sa
      WHERE sa.id = sales_agent_calendars.sales_agent_id AND sa.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS sales_agent_calendars_insert ON public.sales_agent_calendars;
CREATE POLICY sales_agent_calendars_insert ON public.sales_agent_calendars
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales_agents sa
      WHERE sa.id = sales_agent_calendars.sales_agent_id
        AND sa.user_id = auth.uid()
        AND sa.is_active = TRUE
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS sales_agent_calendars_update ON public.sales_agent_calendars;
CREATE POLICY sales_agent_calendars_update ON public.sales_agent_calendars
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.sales_agents sa
      WHERE sa.id = sales_agent_calendars.sales_agent_id AND sa.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS sales_agent_calendars_delete ON public.sales_agent_calendars;
CREATE POLICY sales_agent_calendars_delete ON public.sales_agent_calendars
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.sales_agents sa
      WHERE sa.id = sales_agent_calendars.sales_agent_id AND sa.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );
