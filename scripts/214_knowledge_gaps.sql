-- 214 — Lacune di conoscenza: l'anello fra l'esperienza e le basi.
--
-- Perche' esiste questa tabella.
-- Le basi di conoscenza si alimentavano SOLO a mano: 103 fonti, 102 link e un
-- PDF, tutte incollate da una persona. Nulla tornava indietro dalle
-- conversazioni, quindi una domanda che gli ospiti facevano ogni settimana e
-- che la base non copriva restava scoperta per sempre: nessuno lo sapeva.
--
-- Il vincolo di `knowledge_sources.type` ammette da sempre il valore
-- 'conversation', e `indexSource()` lo sa gia' leggere: l'anello era progettato
-- e mai costruito (zero righe di quel tipo). Questa tabella e' il pezzo che
-- mancava, ma NON scrive niente nelle basi da sola.
--
-- Perche' serve un passaggio umano.
-- Se le conversazioni diventassero conoscenza automaticamente, la prima
-- risposta sbagliata dell'assistente - o una concessione eccezionale fatta da
-- un addetto a un singolo ospite (uno sconto, una partenza tardiva gratuita) -
-- diventerebbe "verita'" e verrebbe ripetuta a tutti, per sempre. Su Telegram,
-- WhatsApp e chat l'assistente risponde in autopilota: si autoalimenterebbe con
-- i propri errori. Quindi qui si raccolgono CANDIDATI; una persona approva, e
-- solo l'approvazione crea la fonte.
create table if not exists public.knowledge_gaps (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,

  -- Da dove nasce la lacuna. Le conversazioni si possono archiviare o
  -- cancellare: SET NULL, non CASCADE, perche' la lacuna resta valida (la
  -- domanda e' stata fatta davvero) anche se il filo di origine sparisce.
  conversation_id uuid references public.conversations(id) on delete set null,
  channel text,

  -- La base che avrebbe dovuto contenere la risposta: e' quella che riceve la
  -- fonte all'approvazione. Se la base viene eliminata la lacuna sopravvive e
  -- chi approva sceglie un'altra base.
  knowledge_base_id uuid references public.knowledge_bases(id) on delete set null,

  -- La domanda dell'ospite, come l'ha scritta.
  question text not null,
  -- Forma normalizzata (minuscole, senza accenti/punteggiatura) usata SOLO per
  -- riconoscere la stessa domanda ripetuta. Senza questa colonna la stessa
  -- richiesta fatta da dieci ospiti diventerebbe dieci righe da approvare dieci
  -- volte, invece di una riga che dichiara "chiesto 10 volte".
  question_key text not null,

  -- Cosa aveva risposto l'assistente senza appoggiarsi alla base. Va mostrato a
  -- chi approva: e' il testo che l'ospite ha ricevuto davvero.
  ai_answer text,
  -- Quanto la base somigliava alla domanda, e la soglia in vigore in quel
  -- momento. Entrambi salvati: la soglia si puo' cambiare dopo, e senza il
  -- valore storico non si potrebbe piu' dire perche' quella risposta non era
  -- fondata.
  similarity numeric,
  threshold numeric,

  occurrences integer not null default 1,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),

  -- 'aperta'    -> in attesa di una persona
  -- 'approvata' -> e' diventata una fonte della base (source_id)
  -- 'ignorata'  -> una persona ha deciso che non deve entrare nella base
  status text not null default 'aperta' check (status in ('aperta', 'approvata', 'ignorata')),

  -- La risposta approvata: quella scritta o corretta da una persona, non quella
  -- inventata dall'assistente.
  approved_answer text,

  -- Chi ha deciso. La colonna e' `uuid` ma l'identita' non e' sempre un uuid
  -- (la scorciatoia di sviluppo vale "dev-admin-id", un super amministratore
  -- non ha scheda operatore): il codice passa NULL in quei casi, altrimenti
  -- Postgres rifiuterebbe l'intera riga.
  resolved_by uuid,
  resolved_at timestamptz,

  -- La fonte nata dall'approvazione. SET NULL: se la fonte viene eliminata la
  -- lacuna non deve sparire, deve poter tornare visibile.
  source_id uuid references public.knowledge_sources(id) on delete set null,

  -- Quante volte la domanda e' ricomparsa DOPO che era stata risolta. Serve a
  -- dire una cosa che altrimenti nessuno saprebbe: "approvata, ma gli ospiti
  -- continuano a chiederlo" (la risposta inserita non funziona). Non riapre la
  -- lacuna da sola: non si scavalca la decisione di una persona.
  seen_after_resolution integer not null default 0,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Una sola riga per domanda e struttura: le ripetizioni alzano `occurrences`.
create unique index if not exists knowledge_gaps_question_key_uniq
  on public.knowledge_gaps (property_id, question_key);

-- Elenco tipico della pagina: le aperte, quelle chieste piu' spesso in cima.
create index if not exists knowledge_gaps_status_idx
  on public.knowledge_gaps (property_id, status, occurrences desc);

alter table public.knowledge_gaps enable row level security;

-- Nessuna politica permissiva: si accede solo dal server con la chiave di
-- servizio, come per le altre tabelle della conoscenza. La chiave anonima non
-- deve poter leggere le domande degli ospiti.
