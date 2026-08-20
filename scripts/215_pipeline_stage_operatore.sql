-- 215 — Pipeline CRM: la fase decisa dall'operatore, separata dalla lettura dell'IA.
--
-- CONTESTO MISURATO (19/08/2026)
--
-- `contact_date_requests` ha già `outcome`, riempito dall'estrattore con ciò che
-- l'IA ha *letto* nella conversazione ("aperta", "confermata", oppure NULL).
-- Su 200 righe reali: {aperta: 14, confermata: 4, NULL: 1} fra le richieste di
-- persone, e "confermata" per le 173 notifiche del gestionale.
--
-- PERCHÉ NON RIUSARE `outcome` PER LA FASE
--
-- Se l'operatore scrivesse la sua decisione dentro `outcome`, la colonna
-- conterrebbe due cose diverse con lo stesso nome: una lettura automatica e una
-- decisione umana. Alla prima rilettura della conversazione l'estrattore
-- sovrascriverebbe la scelta della persona senza che nessuno se ne accorga, e
-- soprattutto non si potrebbe più rispondere a "chi l'ha deciso?".
--
-- Quindi la fase sta in colonne proprie, con autore e istante. `outcome` resta
-- ciò che è: la lettura dell'IA, mostrata come nota.
--
-- PERCHÉ NESSUN AUTORE PER LA TARIFFA
--
-- `quoted_rate_cents` esiste già ed è sempre NULL (misurato: 0 righe su 200 con
-- un valore, perché nessun payload dell'estrattore contiene prezzi). Può essere
-- riempita SOLO da una persona, quindi non serve una colonna per dichiarare chi:
-- l'esistenza del valore lo dice già.
--
-- ADDITIVA: nessuna colonna rimossa o rinominata, nessuna riga modificata.

alter table public.contact_date_requests
  add column if not exists stage text,
  add column if not exists stage_set_by uuid,
  add column if not exists stage_set_at timestamptz;

comment on column public.contact_date_requests.stage is
  'Fase decisa da un operatore. NULL = nessuno ha ancora deciso, la riga sta in "Da qualificare". Non confondere con outcome, che è ciò che l''IA ha letto.';
comment on column public.contact_date_requests.stage_set_by is
  'Utente che ha deciso la fase. NULL quando stage è NULL.';
comment on column public.contact_date_requests.stage_set_at is
  'Istante della decisione, per poter dire "chi e quando" senza dedurlo.';

-- I valori ammessi sono un elenco chiuso: una fase scritta a mano con un nome
-- sbagliato sparirebbe da tutte le colonne senza dare errore, cioè una riga
-- invisibile invece di un rifiuto. NOT VALID non serve: la colonna è appena
-- nata, quindi tutte le righe esistenti hanno stage NULL, che il vincolo ammette.
alter table public.contact_date_requests
  drop constraint if exists contact_date_requests_stage_check;
alter table public.contact_date_requests
  add constraint contact_date_requests_stage_check
  check (stage is null or stage in ('da_qualificare','aperta','preventivo_inviato','confermata','persa'));

-- Autore e istante non hanno senso separati dalla decisione: una fase senza
-- autore non risponde a "chi l'ha deciso", e un autore senza fase è un residuo.
alter table public.contact_date_requests
  drop constraint if exists contact_date_requests_stage_autore_check;
alter table public.contact_date_requests
  add constraint contact_date_requests_stage_autore_check
  check (
    (stage is null and stage_set_by is null and stage_set_at is null)
    or (stage is not null and stage_set_at is not null)
  );

-- NESSUN INDICE NUOVO, e vale la pena dire perché.
--
-- Avevo scritto qui un `create index if not exists idx_cdr_property_checkin ...
-- (property_id, requested_check_in desc nulls last)`. Il comando è passato
-- senza errori ma non ha fatto NIENTE: quell'indice esiste già dalla migrazione
-- 211, con definizione `(property_id, requested_check_in)` — senza `desc`.
-- `if not exists` guarda il NOME, non la definizione, quindi un indice diverso
-- da quello dichiarato viene accettato in silenzio.
--
-- Lasciare quella riga avrebbe messo nel repository una dichiarazione falsa:
-- il file avrebbe detto "indice discendente" e il database ne avrebbe avuto un
-- altro. Non lo ricreo al solo scopo di aggiungere `desc`, perché un btree si
-- percorre in entrambi i versi e l'ordinamento della pagina funziona già con
-- l'indice esistente.

