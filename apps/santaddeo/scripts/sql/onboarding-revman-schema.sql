-- =====================================================================
-- Schema per Onboarding (post-firma) e Area Revenue Manager
-- 21/05/2026 - Piano commission con consulenza
-- =====================================================================

-- 1) Template di attivita' (libreria predefiniti, riutilizzabili)
CREATE TABLE IF NOT EXISTS onboarding_task_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  category TEXT, -- es. 'documenti', 'tecnico', 'marketing'
  default_order INTEGER DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id)
);

-- Seed di template iniziali (idempotente).
INSERT INTO onboarding_task_templates (title, description, category, default_order)
SELECT * FROM (VALUES
  ('Inviare listino ufficiale', 'Caricare il listino ufficiale di tutte le tipologie di camera per l''anno in corso', 'documenti', 10),
  ('Configurare integrazione PMS', 'Verificare che le credenziali del PMS siano corrette e che il sync funzioni', 'tecnico', 20),
  ('Caricare foto camere', 'Fornire foto rappresentative di ogni tipologia di camera', 'marketing', 30),
  ('Definire mercati di riferimento', 'Indicare i principali mercati (geografici e segmenti) su cui la struttura punta', 'strategia', 40),
  ('Verificare contratti OTA', 'Confermare presenza/assenza dei contratti OTA principali (Booking, Expedia, Airbnb)', 'documenti', 50),
  ('Approvare strategia tariffaria iniziale', 'Validare la prima impostazione di tariffe base e fasce di occupazione proposta dal consulente', 'strategia', 60)
) AS v(title, description, category, default_order)
WHERE NOT EXISTS (SELECT 1 FROM onboarding_task_templates LIMIT 1);

-- 2) Checklist di onboarding per subscription (1:1 con accelerator_subscriptions)
CREATE TABLE IF NOT EXISTS onboarding_checklists (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES accelerator_subscriptions(id) ON DELETE CASCADE,
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'in_progress', 'awaiting_review', 'configuring', 'live')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  configuration_started_at TIMESTAMPTZ,
  went_live_at TIMESTAMPTZ,
  UNIQUE(subscription_id)
);
CREATE INDEX IF NOT EXISTS idx_onboarding_checklists_hotel ON onboarding_checklists(hotel_id);

-- 3) Voci della checklist (instances)
CREATE TABLE IF NOT EXISTS onboarding_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  checklist_id UUID NOT NULL REFERENCES onboarding_checklists(id) ON DELETE CASCADE,
  template_id UUID REFERENCES onboarding_task_templates(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT,
  task_order INTEGER NOT NULL DEFAULT 0,
  due_date DATE,
  -- Stati: tenant la marca completed -> SuperAdmin la approva (approved)
  -- oppure rimanda (rejected con reason).
  status TEXT NOT NULL DEFAULT 'todo'
    CHECK (status IN ('todo', 'completed', 'approved', 'rejected')),
  completed_at TIMESTAMPTZ,
  completed_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES profiles(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_checklist ON onboarding_tasks(checklist_id);
CREATE INDEX IF NOT EXISTS idx_onboarding_tasks_status ON onboarding_tasks(status);

-- =====================================================================
-- Area Revenue Manager (visibile a tenant + staff)
-- =====================================================================

-- 4) Note/conversazioni storicizzate (pin di sintesi alla chat AI Taddeo)
CREATE TABLE IF NOT EXISTS revman_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  -- Origine della nota: chat AI (riassunto), nota manuale del consulente, nota tenant
  origin TEXT NOT NULL DEFAULT 'manual'
    CHECK (origin IN ('manual', 'chat_summary', 'meeting', 'system')),
  title TEXT,
  content TEXT NOT NULL,
  -- Riferimento opzionale alla sessione chat Taddeo
  chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'shared'
    CHECK (visibility IN ('shared', 'staff_only')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  pinned BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS idx_revman_notes_hotel ON revman_notes(hotel_id);
CREATE INDEX IF NOT EXISTS idx_revman_notes_chat ON revman_notes(chat_session_id);

-- 5) Attivita' di RevMan (followup, raccomandazioni, deliverable)
CREATE TABLE IF NOT EXISTS revman_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  owner_role TEXT NOT NULL DEFAULT 'tenant'
    CHECK (owner_role IN ('tenant', 'staff')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'in_progress', 'completed', 'cancelled')),
  due_date DATE,
  related_chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID REFERENCES profiles(id),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_revman_activities_hotel ON revman_activities(hotel_id);
CREATE INDEX IF NOT EXISTS idx_revman_activities_status ON revman_activities(status);

-- 6) File caricati su Vercel Blob (relazioni, documenti)
CREATE TABLE IF NOT EXISTS revman_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hotel_id UUID NOT NULL REFERENCES hotels(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  content_type TEXT,
  size_bytes BIGINT,
  blob_url TEXT NOT NULL,         -- URL Vercel Blob (private)
  blob_pathname TEXT NOT NULL,    -- pathname per delete
  category TEXT,                  -- 'relazione_avvio', 'report_mensile', 'documento', ...
  description TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  uploaded_by UUID REFERENCES profiles(id)
);
CREATE INDEX IF NOT EXISTS idx_revman_files_hotel ON revman_files(hotel_id);

-- =====================================================================
-- RLS: tutte queste tabelle sono accessibili via API server-side con
-- service-role. Lasciamo RLS DISABLED per coerenza con altre tabelle
-- gestite esclusivamente dalle API (es. accelerator_subscriptions).
-- Le policy lato applicazione (super_admin / hotel ownership) sono
-- enforced negli API route handlers (vedi MEMORY: createServiceRoleClient
-- pattern).
-- =====================================================================
