-- I reparti dei dipendenti e i gruppi degli utenti erano due liste separate con
-- gli stessi campi (name, color): i 4 gruppi reali della struttura (Front Office,
-- Direzione, F&B, Spa) SONO i reparti dell'albergo, ma `hr_departments` era vuota
-- e costringeva a ridigitarli, con la certezza che poi divergessero (stesso
-- reparto con due nomi o due colori, e nessuna risposta possibile a "chi del
-- Front Office e' in turno E vede l'inbox").
-- Da qui in avanti la lista e' una sola: `user_groups`.
--
-- Questo file esiste perche' `20260817090000_add_hr_core.sql` CREA
-- `hr_departments`: senza la fusione anche qui, un ambiente nuovo ripartirebbe
-- col vecchio impianto a due liste mentre quello attuale ha quello fuso.

-- Guardia: la fusione e' sicura solo perche' i reparti non contengono nulla
-- (misurato: 0 reparti, 0 dipendenti, 0 turni). Se un domani questa migrazione
-- girasse dove i reparti sono stati usati, deve FERMARSI: cancellare in silenzio
-- l'organizzazione del personale di un albergo sarebbe il danno peggiore che
-- questo file possa fare.
do $$
declare n_reparti bigint; n_legati bigint;
begin
  if not exists (select 1 from information_schema.tables where table_schema='public' and table_name='hr_departments') then
    return;
  end if;
  select count(*) into n_reparti from public.hr_departments;
  select count(*) into n_legati from public.hr_employees where department_id is not null;
  if n_reparti > 0 or n_legati > 0 then
    raise exception 'Migrazione rifiutata: % reparti e % dipendenti legati. Va scritto prima un travaso hr_departments -> user_groups.', n_reparti, n_legati;
  end if;
end $$;

-- Le due colonne puntano ai gruppi. ON DELETE SET NULL e non CASCADE: se si
-- elimina un gruppo, il dipendente resta (senza reparto) e i suoi turni restano.
-- Con CASCADE, cancellare "F&B" dalla pagina dei gruppi avrebbe cancellato turni
-- gia' pubblicati e comunicati al personale.
alter table public.hr_employees drop constraint if exists hr_employees_department_id_fkey;
alter table public.hr_employees
  add constraint hr_employees_department_id_fkey
  foreign key (department_id) references public.user_groups(id) on delete set null;

alter table public.hr_shifts drop constraint if exists hr_shifts_department_id_fkey;
alter table public.hr_shifts
  add constraint hr_shifts_department_id_fkey
  foreign key (department_id) references public.user_groups(id) on delete set null;

-- Ora la tabella duplicata puo' andarsene. Restare vuota sarebbe peggio che
-- sparire: il prossimo lettore del codice non saprebbe quale delle due e' viva.
drop table if exists public.hr_departments;
