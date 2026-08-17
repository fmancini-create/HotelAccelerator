-- Integrazione a due vie delle anagrafiche con il PMS (Scidoo).
--
-- MISURATO su Villa I Barronci prima di scrivere una riga: 877 contatti in
-- rubrica, 872 con email, **2 con telefono**. Delle 181 telefonate con un
-- numero, solo 2 risultano collegate a un contatto e 102 numeri distinti
-- restano senza nome. Dal PMS non arriva nulla: `pms_guest_id` e `pms_data`
-- sono vuoti su TUTTI gli 877 contatti, perche' non esiste un connettore API e
-- le email di conferma Scidoo non contengono i dati dell'ospite (il parser
-- estrae solo date, numero persone e codice prenotazione).
--
-- Il collegamento telefonata -> contatto FUNZIONA GIA' (`contacts.phone_digits`,
-- colonna generata, confronto sulle ultime 9 cifre): manca solo il dato.
--
-- ATTENZIONE, verificato sullo schema vivo: `pms_integrations` e `contact_stays`
-- ESISTONO GIA' (entrambe vuote, nessun codice le usa: schema orfano di un
-- progetto precedente). Qui si ESTENDE la tabella esistente invece di crearne
-- una nuova: un `create table if not exists` non avrebbe fatto nulla in silenzio
-- e il codice sarebbe poi crollato cercando colonne mai aggiunte.

-- ---------------------------------------------------------------------------
-- 1) Cosa manca alla tabella credenziali che esiste già.
--
-- Già presenti e riusate: property_id, pms_type, api_url, username,
-- password_encrypted, api_key_encrypted, api_secret_encrypted, is_active,
-- sync_contacts, settings, sync_interval_minutes, last_sync_at/status/error.
-- ---------------------------------------------------------------------------

-- Scidoo non rilascia solo una chiave: il partner chiede l'integrazione, la
-- struttura la approva e Scidoo emette un CODICE AUTORIZZATIVO che dichiara
-- quali dati si possono leggere e scrivere. Va conservato cifrato come gli altri
-- segreti (suffisso "_encrypted" = va decifrato con lib/crypto/secrets).
alter table if exists public.pms_integrations
  add column if not exists auth_code_encrypted text;

-- Fin dove e' arrivata la lettura: senza questo ogni passata rileggerebbe
-- l'intero archivio ospiti del PMS.
alter table if exists public.pms_integrations
  add column if not exists last_sync_cursor text;

-- LA VIA DI RITORNO, un interruttore per tipo di dato, TUTTI SPENTI.
--
-- Un solo interruttore "scrivi in Scidoo" costringerebbe ad accettare in blocco
-- cose molto diverse: un tag sbagliato si corregge, un consenso scritto per
-- errore ha conseguenze legali. Spenti all'inizio perche' prima si misura quanti
-- ospiti si abbinano davvero: accendere la scrittura su abbinamenti sbagliati
-- riverserebbe dati errati nell'archivio di chi lavora al ricevimento.
alter table if exists public.pms_integrations
  add column if not exists write_contacts boolean not null default false;
alter table if exists public.pms_integrations
  add column if not exists write_tags boolean not null default false;
alter table if exists public.pms_integrations
  add column if not exists write_notes boolean not null default false;
alter table if exists public.pms_integrations
  add column if not exists write_consents boolean not null default false;

comment on column public.pms_integrations.auth_code_encrypted is
  'Codice autorizzativo rilasciato da Scidoo dopo l''approvazione della struttura. Cifrato.';
comment on column public.pms_integrations.write_consents is
  'Scrittura dei consensi verso il PMS. Spento per difetto: un consenso scritto per errore ha conseguenze legali.';

-- Una sola configurazione per struttura e tipo di PMS: due righe attive
-- significherebbero due archivi in conflitto sulla stessa anagrafica.
create unique index if not exists pms_integrations_property_type_unico_idx
  on public.pms_integrations (property_id, pms_type);

-- ---------------------------------------------------------------------------
-- 2) I valori DIVERSI, affiancati e segnalati (mai sovrascritti).
--
-- Regola scelta: campo vuoto -> lo si riempie; valori DIVERSI -> si conserva
-- anche il secondo e si segnala. Un ospite che ha lasciato due numeri in due
-- momenti non ha un numero "sbagliato": scegliendo d'ufficio, quello buono
-- potrebbe essere lo scartato e nessuno se ne accorgerebbe.
-- ---------------------------------------------------------------------------
create table if not exists public.contact_field_alternates (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,

  field text not null,          -- 'phone' | 'email' | 'name' | ...
  value text not null,          -- il valore ALTERNATIVO, quello non in uso
  current_value text,           -- cosa c'era nel campo quando e' emersa la differenza
  source text not null,         -- 'scidoo' | 'crm'

  -- Finche' `resolved_at` e' nullo la differenza e' da rivedere. Senza questi
  -- campi la coda non si svuoterebbe mai e diventerebbe un elenco che nessuno
  -- guarda piu'.
  resolved_at timestamptz,
  resolved_by uuid,
  resolution text,              -- 'kept_current' | 'promoted_alternate' | 'both_valid' | 'discarded'

  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  seen_count integer not null default 1,

  -- La stessa differenza rivista aggiorna la riga esistente invece di
  -- accodarne una nuova: altrimenti una passata giornaliera creerebbe ogni
  -- giorno lo stesso conflitto.
  unique (contact_id, field, value, source),

  constraint contact_field_alternates_resolution_valida
    check (resolution is null or resolution in ('kept_current', 'promoted_alternate', 'both_valid', 'discarded'))
);

comment on table public.contact_field_alternates is
  'Valori alternativi emersi dal confronto CRM/PMS: affiancati e da rivedere, non sovrascritti.';

create index if not exists contact_field_alternates_da_rivedere_idx
  on public.contact_field_alternates (property_id, resolved_at, field);

-- ---------------------------------------------------------------------------
-- 3) La coda di scrittura verso il PMS, con l'ANTEPRIMA.
--
-- Ogni modifica destinata al PMS passa da qui. Con l'interruttore spento la riga
-- resta 'preview': si vede esattamente cosa SAREBBE stato scritto senza che
-- nulla parta. E' l'unico modo per giudicare gli abbinamenti prima di toccare
-- l'archivio del ricevimento.
-- ---------------------------------------------------------------------------
create table if not exists public.pms_write_queue (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  contact_id uuid references public.contacts (id) on delete set null,
  pms_guest_id text,

  kind text not null,           -- 'contact' | 'tags' | 'note' | 'consent'
  payload jsonb not null default '{}'::jsonb,

  -- 'preview'  = interruttore spento: mostrato, non inviato
  -- 'pending'  = da inviare
  -- 'sent'     = confermato dal PMS
  -- 'failed'   = tentato e rifiutato (con il motivo)
  -- 'skipped'  = non necessario (il PMS aveva gia' il dato)
  status text not null default 'preview',
  attempts integer not null default 0,
  last_error text,

  created_at timestamptz not null default now(),
  sent_at timestamptz,

  constraint pms_write_queue_kind_valido
    check (kind in ('contact', 'tags', 'note', 'consent')),
  constraint pms_write_queue_status_valido
    check (status in ('preview', 'pending', 'sent', 'failed', 'skipped'))
);

comment on column public.pms_write_queue.status is
  '"preview" = interruttore spento: mostra cosa sarebbe stato scritto, senza inviare nulla.';

create index if not exists pms_write_queue_da_inviare_idx
  on public.pms_write_queue (property_id, status, created_at);

-- ---------------------------------------------------------------------------
-- 4) L'origine di ogni consenso.
--
-- I consensi vengono sincronizzati nei due sensi su richiesta esplicita. Se
-- domani un ospite contesta un'iscrizione, "il consenso c'era" non basta: serve
-- dire da dove veniva e quando. Senza questa traccia un consenso importato dal
-- PMS e uno raccolto da un modulo diventano indistinguibili.
-- ---------------------------------------------------------------------------
create table if not exists public.contact_consent_events (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  contact_id uuid not null references public.contacts (id) on delete cascade,

  consent_kind text not null,   -- 'marketing' | 'gdpr'
  granted boolean not null,
  source text not null,         -- 'scidoo' | 'crm' | 'form' | 'import'
  evidence jsonb not null default '{}'::jsonb,  -- data, canale, testo accettato
  occurred_at timestamptz not null default now(),
  recorded_at timestamptz not null default now(),

  constraint contact_consent_events_kind_valido
    check (consent_kind in ('marketing', 'gdpr'))
);

comment on table public.contact_consent_events is
  'Storico dei consensi con la loro origine: serve a dimostrare da dove viene un consenso, non solo che esiste.';

create index if not exists contact_consent_events_contatto_idx
  on public.contact_consent_events (contact_id, consent_kind, occurred_at desc);

-- ---------------------------------------------------------------------------
-- 5) Il registro delle passate, per misurare invece di sperare.
-- ---------------------------------------------------------------------------
create table if not exists public.pms_sync_runs (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties (id) on delete cascade,
  direction text not null,      -- 'pull' | 'push'

  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',

  guests_seen integer not null default 0,
  contacts_matched integer not null default 0,
  contacts_created integer not null default 0,
  fields_filled integer not null default 0,
  conflicts_found integer not null default 0,
  writes_previewed integer not null default 0,
  writes_sent integer not null default 0,
  error_text text,

  constraint pms_sync_runs_direction_valida check (direction in ('pull', 'push')),
  constraint pms_sync_runs_status_valido check (status in ('running', 'ok', 'error'))
);

comment on table public.pms_sync_runs is
  'Esito di ogni passata: quanti ospiti abbinati, quanti campi riempiti, quanti conflitti.';

create index if not exists pms_sync_runs_recenti_idx
  on public.pms_sync_runs (property_id, started_at desc);

-- ---------------------------------------------------------------------------
-- 6) Il legame col PMS, indicizzato.
--
-- `pms_guest_id` esiste gia' su `contacts` ma senza indice: confrontare ospite
-- per ospite a ogni passata farebbe una scansione completa della rubrica.
-- L'indice e' UNICO per struttura, cosi' due contatti non possono puntare allo
-- stesso ospite del PMS (sarebbe un doppione silenzioso).
-- ---------------------------------------------------------------------------
create unique index if not exists contacts_pms_guest_unico_idx
  on public.contacts (property_id, pms_guest_id)
  where pms_guest_id is not null;

-- ---------------------------------------------------------------------------
-- 7) Isolamento fra strutture.
--
-- Le nuove tabelle contengono dati di ospiti: senza RLS la chiave pubblica
-- potrebbe leggerli. Le rotte usano la chiave di servizio, che ignora le policy,
-- quindi attivare RLS non le rompe. Si aggiunge anche il rifiuto esplicito per
-- l'utenza anonima, come sulle altre tabelle con dati di ospiti.
-- ---------------------------------------------------------------------------
alter table public.contact_field_alternates enable row level security;
alter table public.pms_write_queue enable row level security;
alter table public.contact_consent_events enable row level security;
alter table public.pms_sync_runs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'contact_field_alternates' and policyname = 'deny_anon') then
    create policy deny_anon on public.contact_field_alternates as restrictive to anon using (false);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pms_write_queue' and policyname = 'deny_anon') then
    create policy deny_anon on public.pms_write_queue as restrictive to anon using (false);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'contact_consent_events' and policyname = 'deny_anon') then
    create policy deny_anon on public.contact_consent_events as restrictive to anon using (false);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'pms_sync_runs' and policyname = 'deny_anon') then
    create policy deny_anon on public.pms_sync_runs as restrictive to anon using (false);
  end if;
end $$;
