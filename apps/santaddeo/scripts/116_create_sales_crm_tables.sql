-- ============================================================================
-- 116_create_sales_crm_tables.sql
--
-- Schema completo del CRM venditori SANTADDEO.
--
-- 5 tabelle:
--   1. sales_agents              - i venditori (1:1 con auth user)
--   2. sales_agent_hotels        - associazione M:N venditore <-> hotel,
--                                  con % commissione e permessi granulari
--   3. sales_leads               - lead inseriti dai venditori (con tracking token)
--   4. sales_email_templates     - template email modificabili da superadmin
--   5. sales_commissions_ledger  - storico commissioni (snapshot mensile)
--
-- Idempotente: tutto con CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS.
-- RLS attiva: agente vede solo le proprie righe, super_admin vede tutto.
--
-- NOMI COLONNE: allineati al codice applicativo. Le FK usano `sales_agent_id`
-- (e non `agent_id` abbreviato) per evitare ambiguita' con altri tipi di
-- agent/agente che potrebbero comparire in futuro (es. agent AI, ecc.).
-- ============================================================================


-- ===========================================================================
-- 1) sales_agents
-- ===========================================================================
-- Una riga per ogni venditore. Il `user_id` lega al profiles standard
-- (1:1). Un profile diventa "venditore" SOLO quando esiste questa riga
-- E `profiles.role = 'sales_agent'`.
--
-- Permessi globali (`global_can_view_*`): di default tutti FALSE. Possono
-- essere alzati dal superadmin in due modi:
--  - globalmente (questa tabella): si applicano a tutte le strutture
--  - per singola struttura (sales_agent_hotels): override granulare
-- Il codice fa OR tra i due livelli (vedi /api/sales/dashboard).
CREATE TABLE IF NOT EXISTS public.sales_agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  display_name TEXT,
  email TEXT,                                  -- email del venditore (replyTo emails al lead)
  phone TEXT,
  default_commission_percentage NUMERIC(5,2),  -- % default proposto su nuove strutture
  global_can_view_subscription BOOLEAN NOT NULL DEFAULT FALSE,
  global_can_view_payments BOOLEAN NOT NULL DEFAULT FALSE,
  global_can_view_metrics BOOLEAN NOT NULL DEFAULT FALSE,
  global_can_view_full_dashboard BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sales_agents_user ON public.sales_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_sales_agents_active ON public.sales_agents(is_active);


-- ===========================================================================
-- 2) sales_agent_hotels
-- ===========================================================================
-- Associazione M:N (anche se in pratica oggi e' 1:N: un hotel ha 0 o 1
-- venditore). Tieniamo M:N per evolvibilita' (split commissioni futuri).
--
-- `commission_percentage` NULL = non ancora configurata dal superadmin.
-- `attached_via` traccia come e' avvenuta l'associazione:
--   - 'lead_token'   = automatica via tracking token email
--   - 'manual_admin' = inserita a mano dal superadmin
--   - 'manual_lookup'= il venditore l'ha aggiunta lookup successivamente
--
-- Permessi granulari per-struttura: in OR con i global_* del venditore.
CREATE TABLE IF NOT EXISTS public.sales_agent_hotels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_agent_id UUID NOT NULL REFERENCES public.sales_agents(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  commission_percentage NUMERIC(5,2),
  commission_basis TEXT NOT NULL DEFAULT 'mrr' CHECK (commission_basis IN ('mrr', 'one_time', 'mrr_first_only')),
  lead_status TEXT NOT NULL DEFAULT 'configured'
    CHECK (lead_status IN ('lead', 'invited', 'registered', 'configured', 'active', 'suspended', 'churned')),
  can_view_subscription BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_payments BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_metrics BOOLEAN NOT NULL DEFAULT FALSE,
  can_view_full_dashboard BOOLEAN NOT NULL DEFAULT FALSE,
  attached_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  attached_via TEXT NOT NULL DEFAULT 'manual_admin' CHECK (attached_via IN ('lead_token', 'manual_admin', 'manual_lookup')),
  activated_at TIMESTAMPTZ,
  notes TEXT,
  -- FK circolare con sales_leads aggiunto dopo.
  lead_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sales_agent_id, hotel_id)
);

CREATE INDEX IF NOT EXISTS idx_sales_agent_hotels_agent ON public.sales_agent_hotels(sales_agent_id);
CREATE INDEX IF NOT EXISTS idx_sales_agent_hotels_hotel ON public.sales_agent_hotels(hotel_id);


-- ===========================================================================
-- 3) sales_leads
-- ===========================================================================
-- Ogni lead inserito da un venditore. Genera un tracking_token alfanumerico
-- univoco che viene incluso nell'URL del CTA dell'email di presentazione.
-- Quando il lead clicca e si registra, /api/auth/signup matcha il token,
-- aggiorna lo status a 'registered' e linka al user_id.
-- Quando l'utente crea un hotel in onboarding, l'helper attachHotelTo... crea
-- la riga in sales_agent_hotels e marca il lead 'converted'.
--
-- status:
--   draft       = salvato senza invio email (caricato e da contattare)
--   invited     = email inviata, in attesa
--   opened      = (futuro: pixel tracking) email aperta
--   clicked     = (futuro: link tracking) link cliccato
--   registered  = lead si e' registrato (auth.users + profiles creati)
--   converted   = il lead ha attivato un hotel collegato a quel signup
--   rejected    = chiuso perso (motivo opzionale)
CREATE TABLE IF NOT EXISTS public.sales_leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_agent_id UUID NOT NULL REFERENCES public.sales_agents(id) ON DELETE CASCADE,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT NOT NULL,
  hotel_name TEXT NOT NULL,
  phone TEXT,
  notes TEXT,                                     -- note interne dell'agente
  tracking_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'invited', 'opened', 'clicked', 'registered', 'converted', 'rejected')),
  email_sent_at TIMESTAMPTZ,
  email_sent_count INT NOT NULL DEFAULT 0,
  email_message_id TEXT,
  email_opened_at TIMESTAMPTZ,
  registered_at TIMESTAMPTZ,
  signup_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  converted_at TIMESTAMPTZ,
  hotel_id UUID REFERENCES public.hotels(id) ON DELETE SET NULL,
  rejected_reason TEXT,
  source TEXT NOT NULL DEFAULT 'agent_form'
    CHECK (source IN ('agent_form', 'admin_import', 'admin_assigned')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Vincolo: un agente non puo' avere 2 lead con la stessa email.
  -- Se serve invitare lo stesso lead da agenti diversi, e' caso eccezionale
  -- gestito dal superadmin (ricorda: prima associazione vince).
  UNIQUE(sales_agent_id, email)
);

CREATE INDEX IF NOT EXISTS idx_sales_leads_agent ON public.sales_leads(sales_agent_id);
CREATE INDEX IF NOT EXISTS idx_sales_leads_token ON public.sales_leads(tracking_token);
CREATE INDEX IF NOT EXISTS idx_sales_leads_email ON public.sales_leads(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_sales_leads_status ON public.sales_leads(status);
CREATE INDEX IF NOT EXISTS idx_sales_leads_signup_user ON public.sales_leads(signup_user_id);

-- FK circolare: sales_agent_hotels.lead_id -> sales_leads.id
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='sales_agent_hotels'
      AND constraint_name='sales_agent_hotels_lead_id_fkey'
  ) THEN
    ALTER TABLE public.sales_agent_hotels
      ADD CONSTRAINT sales_agent_hotels_lead_id_fkey
      FOREIGN KEY (lead_id) REFERENCES public.sales_leads(id) ON DELETE SET NULL;
  END IF;
END $$;


-- ===========================================================================
-- 4) sales_email_templates
-- ===========================================================================
-- Template email modificabili dal superadmin. Per MVP serve solo la
-- categoria 'lead_presentation'. Tabella generica per template futuri.
-- I placeholder usati dal renderer sono:
--   {{nome_lead}}, {{cognome_lead}}, {{nome_struttura}},
--   {{nome_venditore}}, {{email_venditore}}, {{link_signup}},
--   {{link_dashboard_demo}}
CREATE TABLE IF NOT EXISTS public.sales_email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category TEXT NOT NULL,                      -- es: 'lead_presentation'
  subject_template TEXT NOT NULL,
  html_template TEXT NOT NULL,
  -- Documentazione dei placeholder per UI editor + validazione.
  available_placeholders JSONB NOT NULL DEFAULT '[]'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  updated_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Solo un template attivo per categoria.
CREATE UNIQUE INDEX IF NOT EXISTS uq_sales_email_templates_active_per_category
  ON public.sales_email_templates(category) WHERE is_active = TRUE;


-- ===========================================================================
-- 5) sales_commissions_ledger
-- ===========================================================================
-- Storico commissioni calcolate, una riga per (agente, hotel, mese).
-- Calcolo: sweep mensile dal superadmin che legge accelerator_subscriptions
-- e crea le righe pending. Il superadmin poi approva/marca paid manualmente.
CREATE TABLE IF NOT EXISTS public.sales_commissions_ledger (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sales_agent_id UUID NOT NULL REFERENCES public.sales_agents(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES public.hotels(id) ON DELETE CASCADE,
  period_year INT NOT NULL CHECK (period_year >= 2020 AND period_year <= 2100),
  period_month INT NOT NULL CHECK (period_month BETWEEN 1 AND 12),
  period_start DATE NOT NULL,                   -- comodita' per query GTE
  base_amount_eur NUMERIC(10,2) NOT NULL DEFAULT 0,
  commission_percentage NUMERIC(5,2) NOT NULL,
  amount_eur NUMERIC(10,2) NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'EUR',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'paid', 'voided')),
  paid_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(sales_agent_id, hotel_id, period_year, period_month)
);

CREATE INDEX IF NOT EXISTS idx_sales_commissions_agent
  ON public.sales_commissions_ledger(sales_agent_id);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_period
  ON public.sales_commissions_ledger(period_year, period_month);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_status
  ON public.sales_commissions_ledger(status);
CREATE INDEX IF NOT EXISTS idx_sales_commissions_period_start
  ON public.sales_commissions_ledger(period_start);


-- ===========================================================================
-- Trigger updated_at
-- ===========================================================================
-- Funzione comune (skippa se gia' esiste).
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE t TEXT;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'sales_agents',
    'sales_agent_hotels',
    'sales_leads',
    'sales_email_templates',
    'sales_commissions_ledger'
  ]) LOOP
    EXECUTE format(
      'DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', t, t
    );
    EXECUTE format(
      'CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();',
      t, t
    );
  END LOOP;
END $$;


-- ===========================================================================
-- RLS
-- ===========================================================================
-- Pattern: l'agente accede solo alle proprie righe, il super_admin vede tutto.
-- Helper: profile_is_super_admin(uuid) gia' deve esistere; in caso contrario
-- usiamo subquery inline.

ALTER TABLE public.sales_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_agent_hotels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales_commissions_ledger ENABLE ROW LEVEL SECURITY;

-- ---- sales_agents ----
DROP POLICY IF EXISTS sales_agents_self_select ON public.sales_agents;
CREATE POLICY sales_agents_self_select ON public.sales_agents
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS sales_agents_admin_all ON public.sales_agents;
CREATE POLICY sales_agents_admin_all ON public.sales_agents
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- ---- sales_agent_hotels ----
DROP POLICY IF EXISTS sales_agent_hotels_select ON public.sales_agent_hotels;
CREATE POLICY sales_agent_hotels_select ON public.sales_agent_hotels
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sales_agents sa
      WHERE sa.id = sales_agent_hotels.sales_agent_id AND sa.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS sales_agent_hotels_admin_all ON public.sales_agent_hotels;
CREATE POLICY sales_agent_hotels_admin_all ON public.sales_agent_hotels
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- ---- sales_leads ----
DROP POLICY IF EXISTS sales_leads_select ON public.sales_leads;
CREATE POLICY sales_leads_select ON public.sales_leads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sales_agents sa
      WHERE sa.id = sales_leads.sales_agent_id AND sa.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS sales_leads_insert ON public.sales_leads;
CREATE POLICY sales_leads_insert ON public.sales_leads
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.sales_agents sa
      WHERE sa.id = sales_leads.sales_agent_id
        AND sa.user_id = auth.uid()
        AND sa.is_active = TRUE
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS sales_leads_update ON public.sales_leads;
CREATE POLICY sales_leads_update ON public.sales_leads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.sales_agents sa
      WHERE sa.id = sales_leads.sales_agent_id AND sa.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS sales_leads_admin_delete ON public.sales_leads;
CREATE POLICY sales_leads_admin_delete ON public.sales_leads
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- ---- sales_email_templates ----
-- Lettura: tutti gli autenticati (serve al renderer dell'email lato agente).
-- Scrittura: solo superadmin.
DROP POLICY IF EXISTS sales_email_templates_select ON public.sales_email_templates;
CREATE POLICY sales_email_templates_select ON public.sales_email_templates
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS sales_email_templates_admin_all ON public.sales_email_templates;
CREATE POLICY sales_email_templates_admin_all ON public.sales_email_templates
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

-- ---- sales_commissions_ledger ----
DROP POLICY IF EXISTS sales_commissions_select ON public.sales_commissions_ledger;
CREATE POLICY sales_commissions_select ON public.sales_commissions_ledger
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.sales_agents sa
      WHERE sa.id = sales_commissions_ledger.sales_agent_id AND sa.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );

DROP POLICY IF EXISTS sales_commissions_admin_all ON public.sales_commissions_ledger;
CREATE POLICY sales_commissions_admin_all ON public.sales_commissions_ledger
  FOR ALL USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'super_admin')
  );


-- ===========================================================================
-- Seed: template email iniziale 'lead_presentation'
-- ===========================================================================
-- Inserito SOLO se non esiste gia' un template attivo di quella categoria.
-- Branding santaddeo, tono cordiale, focus sui benefici. Il superadmin
-- lo modifichera' dall'editor /superadmin/sales/email-templates.
INSERT INTO public.sales_email_templates (
  category, subject_template, html_template, available_placeholders, is_active
)
SELECT
  'lead_presentation',
  '{{nome_lead}}, una proposta su misura per {{nome_struttura}}',
  $TPL$
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #0f172a;">
  <p>Ciao <strong>{{nome_lead}}</strong>,</p>

  <p>
    Sono <strong>{{nome_venditore}}</strong> di SANTADDEO. Ho dato un&rsquo;occhiata
    alla tua struttura, <strong>{{nome_struttura}}</strong>, e credo possiamo
    aiutarti ad aumentare il fatturato camere senza aggiungere lavoro alla
    tua giornata.
  </p>

  <p>
    SANTADDEO e&rsquo; il Revenue Management System che gli hotel italiani
    usano per:
  </p>
  <ul style="line-height: 1.7;">
    <li>aumentare RevPAR e ADR con suggerimenti di prezzo dinamici;</li>
    <li>monitorare le OTA e bloccare vendite sotto-prezzo (modulo Guard);</li>
    <li>vedere occupazione, pickup e KPI in una dashboard chiara;</li>
    <li>integrare il PMS in pochi minuti con la nostra Connessione PMS guidata.</li>
  </ul>

  <p style="margin: 24px 0;">
    <a
      href="{{link_dashboard_demo}}"
      style="display: inline-block; background: #059669; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 600;"
    >
      Prova la Dashboard Gratuita
    </a>
  </p>

  <p>
    Niente carta di credito, nessun trial fee. In 30 secondi vedi i tuoi
    KPI e capisci se ti puo&rsquo; servire. Quando vuoi possiamo fissare una
    chiamata: rispondi pure a questa email.
  </p>

  <p style="margin-top: 32px;">
    A presto,<br />
    <strong>{{nome_venditore}}</strong><br />
    <a href="mailto:{{email_venditore}}" style="color: #059669;">{{email_venditore}}</a>
  </p>

  <hr style="margin: 32px 0; border: none; border-top: 1px solid #e2e8f0;" />
  <p style="font-size: 12px; color: #64748b;">
    Hai ricevuto questa email perche&rsquo; {{nome_venditore}} ha pensato che
    SANTADDEO potesse interessarti. Se preferisci non ricevere altre
    comunicazioni, basta rispondere "no grazie".
  </p>
</div>
  $TPL$,
  '["nome_lead","cognome_lead","nome_struttura","nome_venditore","email_venditore","link_signup","link_dashboard_demo"]'::jsonb,
  TRUE
WHERE NOT EXISTS (
  SELECT 1 FROM public.sales_email_templates
  WHERE category = 'lead_presentation' AND is_active = TRUE
);


-- ===========================================================================
-- Permessi profile.role per il nuovo ruolo 'sales_agent'
-- ===========================================================================
-- profiles.role esiste come TEXT. Aggiungiamo NIENTE qui: il valore
-- 'sales_agent' sara' settato dal superadmin via l'editor utenti.
-- Se in futuro c'e' un CHECK constraint sul role, ricordarsi di aggiungere
-- 'sales_agent' all'enum.
