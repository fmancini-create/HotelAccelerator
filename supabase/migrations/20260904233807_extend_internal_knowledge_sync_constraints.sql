alter table public.internal_knowledge_sync_sources
  drop constraint if exists internal_knowledge_sync_sources_product_check,
  drop constraint if exists internal_knowledge_sync_sources_paths_check;

alter table public.internal_knowledge_sync_sources
  add constraint internal_knowledge_sync_sources_product_check
  check (product_key = any (array[
    'hotel-accelerator'::text,
    'santaddeo-rms'::text,
    'hotel-profit-ai'::text,
    'manubot'::text,
    'autoexel'::text,
    'mypetsenseai'::text,
    'daynext'::text,
    'risparmio-compulsivo'::text
  ])),
  add constraint internal_knowledge_sync_sources_paths_check
  check (jsonb_typeof(source_paths) = 'array'::text and jsonb_array_length(source_paths) between 1 and 200);
