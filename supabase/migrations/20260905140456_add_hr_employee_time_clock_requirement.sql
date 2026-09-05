-- Obbligo di timbratura selettivo per dipendente.
-- Additivo e retrocompatibile: gli utenti esistenti restano invariati finche'
-- un tenant admin non abilita esplicitamente il flag dalla configurazione HR.
alter table public.hr_employees
  add column if not exists requires_time_clock boolean not null default false;

comment on column public.hr_employees.requires_time_clock is
  'Se true, l utente collegato deve passare dalla timbratura nel login mobile prima di accedere alla dashboard.';
