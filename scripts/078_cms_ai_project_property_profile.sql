-- Persist the property description used by CMS recommendations and generation.
-- Additive and backward-compatible migration.

ALTER TABLE public.cms_ai_projects
  ADD COLUMN IF NOT EXISTS property_profile text;

ALTER TABLE public.cms_ai_projects
  DROP CONSTRAINT IF EXISTS cms_ai_projects_property_profile_length_check;

ALTER TABLE public.cms_ai_projects
  ADD CONSTRAINT cms_ai_projects_property_profile_length_check
  CHECK (property_profile IS NULL OR char_length(property_profile) <= 5000);

COMMENT ON COLUMN public.cms_ai_projects.property_profile IS
  'Tenant-scoped property description used to recommend templates and generate the initial CMS document.';
