alter table public.ai_agent_settings alter column display_name drop default;

comment on column public.ai_agent_settings.display_name is
  'Legacy tenant-wide AI display name retained temporarily for schema compatibility; runtime identity is owned by ai_virtual_users per knowledge base.';

comment on column public.ai_agent_settings.signature_html is
  'Legacy tenant-wide AI signature retained temporarily for schema compatibility; runtime signatures are owned by ai_virtual_users per knowledge base.';
