-- Versioned structured document for the AI-first visual CMS builder.
-- The document is tenant-scoped through cms_ai_projects and validated again server-side.

ALTER TABLE public.cms_ai_projects
  ADD COLUMN IF NOT EXISTS builder_schema_version integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS builder_document jsonb;

ALTER TABLE public.cms_ai_projects
  DROP CONSTRAINT IF EXISTS cms_ai_projects_builder_schema_version_check;

ALTER TABLE public.cms_ai_projects
  ADD CONSTRAINT cms_ai_projects_builder_schema_version_check
  CHECK (builder_schema_version > 0);

ALTER TABLE public.cms_ai_projects
  DROP CONSTRAINT IF EXISTS cms_ai_projects_builder_document_object_check;

ALTER TABLE public.cms_ai_projects
  ADD CONSTRAINT cms_ai_projects_builder_document_object_check
  CHECK (builder_document IS NULL OR jsonb_typeof(builder_document) = 'object');

COMMENT ON COLUMN public.cms_ai_projects.builder_schema_version IS
  'Version of the validated CMS builder JSON contract.';

COMMENT ON COLUMN public.cms_ai_projects.builder_document IS
  'Validated structured site document used by mouse, text and voice editing. It is not executable code.';
