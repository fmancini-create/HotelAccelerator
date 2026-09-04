create or replace function public.upsert_internal_knowledge_sync_source(
  p_hub_property_id uuid,
  p_product_key text,
  p_repository text,
  p_revision text,
  p_content_sha256 text,
  p_source_paths jsonb,
  p_content text
)
returns table(knowledge_base_id uuid, knowledge_source_id uuid, content_changed boolean)
language plpgsql
set search_path to ''
as $function$
declare
  sync_row public.internal_knowledge_sync_sources%rowtype;
  base_id uuid;
  source_id uuid;
  base_name text;
  source_title text;
  base_mode text;
  base_persona text;
  changed boolean := false;
begin
  if p_product_key not in (
    'hotel-accelerator', 'santaddeo-rms', 'hotel-profit-ai', 'manubot',
    'autoexel', 'mypetsenseai', 'daynext', 'risparmio-compulsivo'
  ) then
    raise exception 'Prodotto della knowledge base interna non valido';
  end if;
  if p_repository !~ '^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$' then
    raise exception 'Repository non valido';
  end if;
  if p_revision !~ '^[A-Fa-f0-9]{7,64}$' or p_content_sha256 !~ '^[A-Fa-f0-9]{64}$' then
    raise exception 'Revisione o impronta contenuto non valide';
  end if;
  if jsonb_typeof(p_source_paths) <> 'array' or jsonb_array_length(p_source_paths) not between 1 and 200 then
    raise exception 'Elenco dei file sorgente non valido';
  end if;
  if char_length(p_content) not between 80 and 500000 then
    raise exception 'Contenuto della knowledge base interna non valido';
  end if;
  if not exists (
    select 1
    from public.properties as p
    where p.id = p_hub_property_id and p.slug = '4bid' and p.type = 'company'
  ) then
    raise exception 'Tenant hub 4 BID non valido';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_hub_property_id::text || ':' || p_product_key));

  select *
    into sync_row
  from public.internal_knowledge_sync_sources as sync
  where sync.hub_property_id = p_hub_property_id and sync.product_key = p_product_key
  for update;

  base_name := case p_product_key
    when 'hotel-accelerator' then '4BID · Hotel Accelerator'
    when 'santaddeo-rms' then '4BID · Santaddeo RMS'
    when 'hotel-profit-ai' then '4BID · Hotel Profit AI'
    when 'manubot' then '4BID · ManuBot'
    when 'autoexel' then 'AUTOEXEL'
    when 'mypetsenseai' then 'MYPETSENSEAI'
    when 'daynext' then 'DAYNEXT'
    when 'risparmio-compulsivo' then 'RISPARMIO COMPULSIVO'
  end;

  base_mode := case
    when p_product_key in ('autoexel', 'mypetsenseai', 'daynext', 'risparmio-compulsivo') then 'autopilot'
    else 'disabled'
  end;

  base_persona := case p_product_key
    when 'autoexel' then 'Sei l''assistente virtuale specializzato di AutoExel. Rispondi usando prima di tutto la conoscenza sincronizzata dal repository AutoExel e le informazioni aziendali 4BID come supporto secondario. Spiega funzioni, utilizzo, configurazione e aspetti commerciali in modo chiaro. Non esporre percorsi di file, codice sorgente, revisioni, segreti o dettagli interni non necessari.'
    when 'mypetsenseai' then 'Sei l''assistente virtuale specializzato di MyPetSenseAI. Rispondi usando prima di tutto la conoscenza sincronizzata dal repository MyPetSenseAI e le informazioni aziendali 4BID come supporto secondario. Spiega funzioni e utilizzo del prodotto con chiarezza; non trasformare il supporto software in diagnosi veterinarie e invita a rivolgersi a un veterinario quando la richiesta richiede una valutazione clinica. Non esporre percorsi di file, codice sorgente, revisioni o segreti.'
    when 'daynext' then 'Sei l''assistente virtuale specializzato di DayNext. Rispondi usando prima di tutto la conoscenza sincronizzata dal repository DayNext e le informazioni aziendali 4BID come supporto secondario. Spiega funzioni, utilizzo, configurazione e aspetti commerciali in modo chiaro. Non esporre percorsi di file, codice sorgente, revisioni, segreti o dettagli interni non necessari.'
    when 'risparmio-compulsivo' then 'Sei l''assistente virtuale specializzato di Risparmio Compulsivo. Rispondi usando prima di tutto la conoscenza sincronizzata dal repository Risparmio Compulsivo e le informazioni aziendali 4BID come supporto secondario. Spiega funzioni, utilizzo, configurazione e aspetti commerciali in modo chiaro. Non esporre percorsi di file, codice sorgente, revisioni, segreti o dettagli interni non necessari.'
    else 'Usa soltanto le informazioni fondate nelle fonti. Non citare percorsi di file, revisioni, configurazioni interne o segreti. Se la risposta non e'' affidabile, proponi il trasferimento a un operatore.'
  end;

  source_title := 'Documentazione interna sincronizzata · ' || base_name;

  if not found then
    insert into public.knowledge_bases (
      property_id, name, description, mode, language, persona, confidence_threshold, fallback_message
    ) values (
      p_hub_property_id,
      base_name,
      '[repo:' || p_product_key || '] Documentazione interna sincronizzata automaticamente dal repository del prodotto.',
      base_mode,
      'it',
      base_persona,
      0.35,
      'Non ho una risposta affidabile su questo punto. Posso passare la richiesta a un operatore.'
    ) returning id into base_id;

    insert into public.knowledge_sources (
      property_id, knowledge_base_id, type, title, content, status, error
    ) values (
      p_hub_property_id, base_id, 'text', source_title, p_content, 'pending', null
    ) returning id into source_id;

    insert into public.internal_knowledge_sync_sources (
      hub_property_id, product_key, knowledge_base_id, knowledge_source_id,
      repository, source_paths, last_revision, content_sha256, last_sync_status
    ) values (
      p_hub_property_id, p_product_key, base_id, source_id,
      p_repository, p_source_paths, p_revision, p_content_sha256, 'pending'
    );
    changed := true;
  else
    base_id := sync_row.knowledge_base_id;
    source_id := sync_row.knowledge_source_id;
    changed := sync_row.content_sha256 is distinct from p_content_sha256;

    update public.knowledge_bases
    set name = base_name,
        description = '[repo:' || p_product_key || '] Documentazione interna sincronizzata automaticamente dal repository del prodotto.',
        mode = case when p_product_key in ('autoexel', 'mypetsenseai', 'daynext', 'risparmio-compulsivo') then 'autopilot' else mode end,
        persona = case when p_product_key in ('autoexel', 'mypetsenseai', 'daynext', 'risparmio-compulsivo') then base_persona else persona end,
        updated_at = now()
    where id = base_id and property_id = p_hub_property_id;

    if changed then
      update public.knowledge_sources
      set title = source_title,
          content = p_content,
          status = 'pending',
          error = null,
          updated_at = now()
      where id = source_id and property_id = p_hub_property_id;
    end if;

    update public.internal_knowledge_sync_sources
    set repository = p_repository,
        source_paths = p_source_paths,
        last_revision = p_revision,
        content_sha256 = p_content_sha256,
        last_sync_status = case when changed then 'pending' else last_sync_status end,
        last_error = case when changed then null else last_error end,
        last_received_at = now(),
        updated_at = now()
    where id = sync_row.id;
  end if;

  return query select base_id, source_id, changed;
end;
$function$;
