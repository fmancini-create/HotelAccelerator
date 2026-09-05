-- Indici richiesti dal database advisor per le FK introdotte dalla regia IA.
create index if not exists pms_procedure_kb_base_fk_idx
  on public.pms_procedure_knowledge_bases (knowledge_base_id);

create index if not exists pms_procedure_kb_source_fk_idx
  on public.pms_procedure_knowledge_bases (knowledge_source_id)
  where knowledge_source_id is not null;

create index if not exists pms_shadow_sessions_procedure_fk_idx
  on public.pms_shadow_sessions (procedure_id)
  where procedure_id is not null;

create index if not exists pms_shadow_sessions_usage_fk_idx
  on public.pms_shadow_sessions (usage_session_id)
  where usage_session_id is not null;
