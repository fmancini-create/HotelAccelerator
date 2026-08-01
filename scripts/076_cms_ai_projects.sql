-- Tenant-scoped draft state for the AI-first CMS studio.
-- This stores user intent only; it does not publish pages or execute AI actions.

CREATE TABLE IF NOT EXISTS public.cms_ai_projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL UNIQUE REFERENCES public.properties(id) ON DELETE CASCADE,
  template_id text NOT NULL DEFAULT 'luxury',
  site_name text NOT NULL DEFAULT '',
  style_prompt text NOT NULL DEFAULT '',
  page_prompt text NOT NULL DEFAULT '',
  current_step smallint NOT NULL DEFAULT 1 CHECK (current_step BETWEEN 1 AND 3),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'proposal', 'archived')),
  project_version integer NOT NULL DEFAULT 1 CHECK (project_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.cms_ai_projects IS
  'Tenant-scoped draft input for the AI-first CMS wizard. No automatic publishing or AI execution.';

CREATE INDEX IF NOT EXISTS idx_cms_ai_projects_updated_at
  ON public.cms_ai_projects(updated_at DESC);

ALTER TABLE public.cms_ai_projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cms_ai_projects_service_role ON public.cms_ai_projects;
CREATE POLICY cms_ai_projects_service_role
  ON public.cms_ai_projects
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS cms_ai_projects_tenant ON public.cms_ai_projects;
CREATE POLICY cms_ai_projects_tenant
  ON public.cms_ai_projects
  AS PERMISSIVE
  FOR ALL
  TO authenticated
  USING (
    property_id IN (
      SELECT au.property_id
      FROM public.admin_users au
      WHERE au.email = auth.jwt() ->> 'email'
    )
  )
  WITH CHECK (
    property_id IN (
      SELECT au.property_id
      FROM public.admin_users au
      WHERE au.email = auth.jwt() ->> 'email'
    )
  );

DROP TRIGGER IF EXISTS trg_cms_ai_projects_updated_at ON public.cms_ai_projects;
CREATE TRIGGER trg_cms_ai_projects_updated_at
  BEFORE UPDATE ON public.cms_ai_projects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
