-- Aggiunge campi per integrazione Manubot su properties
-- api_token: Bearer token usato da Manubot per autenticarsi sul bridge
-- manubot_company_id: company_id di Manubot mappato su questa property

ALTER TABLE public.properties
  ADD COLUMN IF NOT EXISTS api_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS manubot_company_id TEXT;

COMMENT ON COLUMN public.properties.api_token IS 'Bearer token statico per autenticazione bridge esterno (Manubot → HotelAccelerator)';
COMMENT ON COLUMN public.properties.manubot_company_id IS 'company_id di Manubot corrispondente a questa property (per sync bidirezionale)';

-- Esegui anche la creazione della tabella todos se non esiste ancora
CREATE TABLE IF NOT EXISTS public.todos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,
  title           text NOT NULL,
  description     text,
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  priority        text NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low', 'normal', 'high', 'urgent')),
  assigned_to     uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  due_date        timestamptz,
  external_id     text,
  external_source text,
  external_url    text,
  external_data   jsonb,
  tags            text[] DEFAULT '{}',
  attachments     jsonb DEFAULT '[]',
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,
  UNIQUE (property_id, external_source, external_id)
);

CREATE INDEX IF NOT EXISTS todos_property_id_idx     ON public.todos(property_id);
CREATE INDEX IF NOT EXISTS todos_assigned_to_idx     ON public.todos(assigned_to);
CREATE INDEX IF NOT EXISTS todos_status_idx          ON public.todos(status);
CREATE INDEX IF NOT EXISTS todos_due_date_idx        ON public.todos(due_date);
CREATE INDEX IF NOT EXISTS todos_external_source_idx ON public.todos(external_source, external_id);

CREATE OR REPLACE FUNCTION update_todos_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  IF NEW.status = 'done' AND OLD.status != 'done' THEN
    NEW.completed_at = now();
  END IF;
  IF NEW.status != 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS todos_updated_at ON public.todos;
CREATE TRIGGER todos_updated_at
  BEFORE UPDATE ON public.todos
  FOR EACH ROW EXECUTE FUNCTION update_todos_updated_at();

ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS todos_tenant_isolation ON public.todos;
CREATE POLICY todos_tenant_isolation ON public.todos
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM public.admin_users
      WHERE id = auth.uid()
    )
  );

DROP POLICY IF EXISTS todos_service_role ON public.todos;
CREATE POLICY todos_service_role ON public.todos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
