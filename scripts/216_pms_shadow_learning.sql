-- 216 — Apprendimento per osservazione dentro il PMS.
--
-- Perche' esiste.
-- Il collegamento via API (215 e precedenti) funziona solo dove il PMS ha una
-- API e solo per cio' che quella API espone: su Scidoo legge gli ospiti e non
-- puo' scrivere nulla. Ma il lavoro vero dello staff avviene DENTRO il PMS, a
-- mano, e nessuna API lo racconta. Questa tabella serve a imparare quel lavoro
-- guardandolo, non a interrogare un'API.
--
-- Il vincolo tecnico che decide la forma di tutto.
-- Il PMS si lascia incorniciare nel nostro sito (misurato: nessun
-- X-Frame-Options), ma il browser NON permette di leggere dentro una cornice di
-- un altro sito: installare un ascoltatore dei clic solleva SecurityError. Non
-- e' una configurazione da cambiare, e' l'isolamento fra siti diversi. Quindi
-- l'osservazione non puo' avvenire nella pagina: deve arrivare da una sorgente
-- che i privilegi li ha (un browser comandato dal nostro server, oppure una
-- estensione installata). Per questo `source` e' una colonna: il cervello qui
-- sotto e' lo stesso per entrambe, e cambiare sorgente non ridisegna le tabelle.
--
-- Cosa NON si salva, e perche'.
-- Chi lavora nel PMS digita anche la propria password, e i dati degli ospiti
-- sono dati di persone reali. Salvare "cosa e' stato digitato" trasformerebbe
-- questa tabella nel posto piu' pericoloso del prodotto. Si salva quindi la
-- FORMA dell'azione (dove si e' cliccato, che tipo di campo si e' compilato) e
-- mai il contenuto: vedi `value_kind` piu' sotto.

-- ---------------------------------------------------------------------------
-- Una sessione di lavoro osservata.
-- ---------------------------------------------------------------------------
create table if not exists public.pms_shadow_sessions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,

  -- Quale PMS si stava usando. Testo e non enum: il registro dei connettori
  -- vive nel codice e cresce, un vincolo qui costringerebbe a una migrazione
  -- per ogni PMS nuovo.
  pms_type text not null,

  -- Da dove arriva l'osservazione. Serve a sapere quanto fidarsi di cio' che e'
  -- stato registrato: un browser comandato da noi vede tutto, una estensione
  -- vede solo cio' che quella persona ha installato.
  source text not null check (source in ('remote_browser', 'extension')),

  -- Chi stava lavorando. La colonna e' uuid ma l'identita' non e' sempre un
  -- uuid (la scorciatoia di sviluppo vale "dev-admin-id", un super
  -- amministratore non ha scheda operatore): il codice passa NULL in quei casi,
  -- altrimenti Postgres rifiuterebbe l'intera riga. Stessa scelta di 214.
  operator_id uuid,
  operator_label text,

  started_at timestamptz not null default now(),
  ended_at timestamptz,

  -- Quanti passi sono stati registrati. Ridondante rispetto al conteggio della
  -- tabella dei passi, ma una sessione si puo' potare (i passi vecchi si
  -- cancellano) e allora il conteggio direbbe zero su una sessione che invece
  -- ha lavorato: e' la differenza fra "non ha fatto niente" e "non lo sappiamo
  -- piu'".
  steps_count integer not null default 0,

  created_at timestamptz not null default now()
);

create index if not exists pms_shadow_sessions_property_idx
  on public.pms_shadow_sessions (property_id, started_at desc);

-- ---------------------------------------------------------------------------
-- I singoli passi osservati.
-- ---------------------------------------------------------------------------
create table if not exists public.pms_shadow_steps (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.pms_shadow_sessions(id) on delete cascade,

  -- Ordine dentro la sessione. Senza un ordine esplicito due passi nello stesso
  -- centesimo di secondo sarebbero indistinguibili, e una procedura e' fatta
  -- proprio dalla loro sequenza.
  seq integer not null,

  -- Che gesto e' stato fatto.
  action text not null check (action in ('navigate', 'click', 'fill', 'select', 'submit', 'keypress')),

  -- Dove. `target_role` e `target_label` sono l'etichetta visibile e il ruolo
  -- accessibile dell'elemento (es. ruolo "button", etichetta "Salva"): sono
  -- stabili quando il PMS cambia grafica, mentre un selettore CSS si rompe al
  -- primo aggiornamento.
  target_role text,
  target_label text,

  -- L'indirizzo della pagina, senza la parte interrogativa: i parametri
  -- contengono spesso il codice della prenotazione o l'identificativo
  -- dell'ospite, che qui non servono e sarebbero dati personali salvati per
  -- sempre.
  url_path text,

  -- LA COLONNA CHE PROTEGGE LE PERSONE.
  -- Non si salva il valore digitato, si salva di che natura era. Cosi' una
  -- procedura resta riconoscibile ("qui si compila una data, poi un importo")
  -- senza che questa tabella contenga password, nomi di ospiti o carte.
  -- 'secret' esiste per dichiarare che un campo password e' stato compilato:
  -- ometterlo renderebbe la sequenza incompleta e quindi non riconoscibile.
  value_kind text check (value_kind in ('empty', 'text', 'number', 'date', 'money', 'email', 'phone', 'secret')),

  occurred_at timestamptz not null default now()
);

-- Un solo passo per posizione dentro la sessione: se la sorgente ritrasmette
-- lo stesso evento (una riconnessione, un tentativo ripetuto) non si duplica.
create unique index if not exists pms_shadow_steps_seq_uniq
  on public.pms_shadow_steps (session_id, seq);

-- ---------------------------------------------------------------------------
-- Le procedure imparate: cio' che si e' visto ripetere.
-- ---------------------------------------------------------------------------
create table if not exists public.pms_observed_procedures (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  pms_type text not null,

  -- Forma normalizzata della sequenza (vedi lib/pms/shadow/procedures.ts).
  -- E' cio' che rende "la stessa procedura fatta dieci volte" una riga che
  -- dichiara "vista 10 volte", invece di dieci righe da valutare dieci volte.
  -- Stessa idea di `question_key` in 214.
  steps_key text not null,

  -- Come si chiama per una persona, e la sequenza leggibile. Il nome lo propone
  -- il sistema dai passi; una persona lo puo' correggere.
  title text not null,
  steps_summary jsonb not null default '[]'::jsonb,

  occurrences integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  -- Quanto rischia questa procedura. Non e' un'opinione: la calcola il codice
  -- dai passi osservati (vedi classifyRisk). 'alto' = toccherebbe soldi o
  -- cancellazioni.
  risk text not null default 'basso' check (risk in ('basso', 'medio', 'alto')),

  -- La soglia in vigore quando la procedura ha maturato l'autonomia, salvata
  -- qui e non solo in configurazione: la soglia si puo' cambiare dopo, e senza
  -- il valore storico non si potrebbe piu' spiegare perche' questa procedura
  -- agisce da sola. Stessa ragione di `threshold` in 214.
  autonomy_threshold integer not null,

  -- 'osservata'  -> registrata, non fa nulla
  -- 'proposta'   -> ha raggiunto la soglia ma il rischio impone una persona
  -- 'autonoma'   -> agisce da sola
  -- 'bloccata'   -> una persona ha deciso che non deve mai agire da sola
  status text not null default 'osservata' check (status in ('osservata', 'proposta', 'autonoma', 'bloccata')),

  -- Chi ha deciso, quando una decisione umana c'e' stata.
  decided_by uuid,
  decided_at timestamptz,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una sola riga per procedura, struttura e PMS: le ripetizioni alzano
-- `occurrences`. Il pms_type entra nella chiave perche' la stessa sequenza su
-- due PMS diversi e' un'altra procedura.
create unique index if not exists pms_observed_procedures_key_uniq
  on public.pms_observed_procedures (property_id, pms_type, steps_key);

-- Elenco tipico della pagina: le piu' ripetute in cima.
create index if not exists pms_observed_procedures_status_idx
  on public.pms_observed_procedures (property_id, status, occurrences desc);

alter table public.pms_shadow_sessions enable row level security;
alter table public.pms_shadow_steps enable row level security;
alter table public.pms_observed_procedures enable row level security;

-- Nessuna politica permissiva: si accede solo dal server con la chiave di
-- servizio. La chiave anonima non deve poter leggere come lavora lo staff ne'
-- quali procedure agiscono da sole.
