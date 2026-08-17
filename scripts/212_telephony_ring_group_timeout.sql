-- Chiamate cadute su un gruppo di squillo.
--
-- MISURATO su Villa I Barronci (179 chiamate reali): ZERO chiamate perse in
-- ARRIVO, che per un hotel e' impossibile. Sull'interno 801 (gruppo di squillo)
-- 31 chiamate su 41 durano ESATTAMENTE 75 secondi: e' il timeout dello squillo,
-- non una conversazione. Controprova sull'interno 207, che e' una persona: la
-- durata piu' ripetuta e' 23s per 6 volte, nessun valore fisso.
-- Di quei 33 chiamanti, 18 hanno richiamato entro un'ora (uno tre volte):
-- non sono stati serviti, ma il registro li contava come "completate".
--
-- 3CX manda `CallDirection=Inbound` e nessun `Missed` per queste chiamate, quindi
-- l'esito NON puo' arrivare dal centralino: va dedotto dal timeout del gruppo.

-- 1) Il timeout di squillo del gruppo, dichiarato da chi conosce il centralino.
--    Senza un valore qui NESSUNA chiamata viene riclassificata: la deduzione
--    resta spenta finche' qualcuno non dichiara il numero, invece di indovinarlo.
alter table if exists public.telephony_extension_labels
  add column if not exists no_answer_seconds integer;

comment on column public.telephony_extension_labels.no_answer_seconds is
  'Secondi di squillo dopo i quali il gruppo lascia cadere la chiamata (3CX: "Ring timeout"). NULL = non dichiarato, nessuna deduzione.';

-- 2) Cosa aveva detto il centralino, conservato.
--    Riscrivere `status` senza tenere l'originale renderebbe impossibile
--    distinguere un esito dichiarato da 3CX da uno dedotto da noi, e la
--    riclassificazione non sarebbe piu' reversibile.
alter table if exists public.phone_calls
  add column if not exists provider_status text;

alter table if exists public.phone_calls
  add column if not exists status_source text;

comment on column public.phone_calls.provider_status is
  'Esito come lo ha comunicato il centralino, prima di ogni deduzione nostra.';

comment on column public.phone_calls.status_source is
  'Da dove viene `status`: "provider" (dichiarato da 3CX) oppure "ring_group_timeout" (dedotto dal timeout del gruppo).';

-- Le righe gia' presenti hanno l'esito del centralino: dichiararlo esplicitamente
-- evita che "NULL" venga poi confuso con "dedotto".
update public.phone_calls
   set status_source = 'provider'
 where status_source is null;

create index if not exists phone_calls_status_source_idx
  on public.phone_calls (property_id, status_source);
