-- 217 — Disconnessione automatica per inattivita': scelta per utente e per gruppo.
--
-- COSA RISOLVE
-- Un computer del ricevimento lasciato aperto e' un accesso aperto: chiunque
-- passi vede la posta, i contatti e le prenotazioni. Serve un tempo dopo il
-- quale la sessione si chiude da sola.
--
-- PERCHE' SU DUE TABELLE
-- La stessa scelta si puo' fare sulla singola persona o sul suo reparto. Non e'
-- una duplicazione: seguiamo la forma che questo progetto usa GIA' per
-- `can_transfer_conversations`, presente sia su `admin_users` sia su
-- `user_groups`. Il valore NULL sull'utente significa "segui i gruppi": serve
-- distinguere "non impostato" da "impostato", altrimenti i gruppi non
-- conterebbero mai nulla (vedi lib/inbox/transfer.ts).
--
-- NULL SU ENTRAMBI = NESSUNA DISCONNESSIONE
-- Volutamente: questa migrazione non deve cambiare il comportamento di nessuno
-- al momento in cui viene applicata. Se il valore predefinito fosse un numero,
-- tutti gli utenti esistenti inizierebbero a essere disconnessi senza che
-- nessuno l'abbia chiesto.
--
-- IL LIMITE INFERIORE E' UNA PROTEZIONE, NON UNA FORMALITA'
-- Con 0 minuti la sessione scadrebbe immediatamente: la persona verrebbe
-- disconnessa nell'istante in cui entra, senza via d'uscita, e nemmeno un
-- amministratore potrebbe rientrare per correggere il valore. Sarebbe un
-- autoblocco dell'intera struttura causato da un campo sbagliato. Il vincolo
-- qui sotto lo rende impossibile a livello di database, cioe' anche se un
-- domani una rotta dimenticasse di validare.
--
-- Il tetto di 480 minuti (8 ore) evita valori senza senso tipo 999999, ma
-- l'elenco dei tempi offerti (1, 5, 10, 15, 30) e' una decisione di prodotto e
-- vive nel codice (lib/auth/auto-logout.ts), non qui: cosi' aggiungere "60"
-- domani non richiede una migrazione.

alter table public.admin_users
  add column if not exists auto_logout_minutes integer;

alter table public.user_groups
  add column if not exists auto_logout_minutes integer;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'admin_users_auto_logout_minutes_valido'
  ) then
    alter table public.admin_users
      add constraint admin_users_auto_logout_minutes_valido
      check (auto_logout_minutes is null or (auto_logout_minutes >= 1 and auto_logout_minutes <= 480));
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'user_groups_auto_logout_minutes_valido'
  ) then
    alter table public.user_groups
      add constraint user_groups_auto_logout_minutes_valido
      check (auto_logout_minutes is null or (auto_logout_minutes >= 1 and auto_logout_minutes <= 480));
  end if;
end $$;

comment on column public.admin_users.auto_logout_minutes is
  'Minuti di inattivita'' dopo i quali la sessione si chiude. NULL = segui i gruppi dell''utente.';

comment on column public.user_groups.auto_logout_minutes is
  'Minuti di inattivita'' per i membri del gruppo. NULL = il gruppo non impone nulla.';
