-- ============================================================
-- TODOS TABLE
-- Multitenant task management with external bridge support
-- Compatible with Manubot via external_id + source fields
-- ============================================================

CREATE TABLE IF NOT EXISTS public.todos (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id     uuid NOT NULL REFERENCES public.properties(id) ON DELETE CASCADE,

  -- Content
  title           text NOT NULL,
  description     text,
  
  -- Status & Priority
  status          text NOT NULL DEFAULT 'open'
                  CHECK (status IN ('open', 'in_progress', 'done', 'cancelled')),
  priority        text NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low', 'normal', 'high', 'urgent')),

  -- Assignment
  assigned_to     uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,
  created_by      uuid REFERENCES public.admin_users(id) ON DELETE SET NULL,

  -- Scheduling
  due_date        timestamptz,

  -- External bridge (Manubot or other apps)
  external_id     text,            -- ID del task nel sistema esterno
  external_source text,            -- e.g. 'manubot', 'pms', 'manual'
  external_url    text,            -- Link diretto al task esterno
  external_data   jsonb,           -- Payload raw dal sistema esterno

  -- Metadata
  tags            text[] DEFAULT '{}',
  attachments     jsonb DEFAULT '[]',

  -- Timestamps
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  completed_at    timestamptz,

  -- Prevent duplicate external tasks per source
  UNIQUE (property_id, external_source, external_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS todos_property_id_idx       ON public.todos(property_id);
CREATE INDEX IF NOT EXISTS todos_assigned_to_idx       ON public.todos(assigned_to);
CREATE INDEX IF NOT EXISTS todos_status_idx            ON public.todos(status);
CREATE INDEX IF NOT EXISTS todos_due_date_idx          ON public.todos(due_date);
CREATE INDEX IF NOT EXISTS todos_external_source_idx   ON public.todos(external_source, external_id);

-- Auto-update updated_at
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

-- RLS
ALTER TABLE public.todos ENABLE ROW LEVEL SECURITY;

CREATE POLICY todos_tenant_isolation ON public.todos
  FOR ALL
  USING (
    property_id IN (
      SELECT property_id FROM public.admin_users
      WHERE id = auth.uid()
    )
  );

CREATE POLICY todos_service_role ON public.todos
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Comments for documentation
COMMENT ON TABLE public.todos IS 'Multitenant task management. Supports external bridge via external_id/external_source (e.g. Manubot).';
COMMENT ON COLUMN public.todos.external_id IS 'ID of the task in the external system (e.g. Manubot intervention ID)';
COMMENT ON COLUMN public.todos.external_source IS 'Source system identifier: manubot | pms | manual | etc.';
COMMENT ON COLUMN public.todos.external_data IS 'Raw payload from the external system for sync purposes';
