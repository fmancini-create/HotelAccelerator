# Inbox Google-like Search — 2026-09-06

## Stato ufficiale

**Codice** sul branch `feat/inbox-google-search`.

Il database di produzione HotelAccelerator contiene gia' le migrazioni della feature e i test SQL sono stati eseguiti su dati reali. Lo stato non passa a `Tenant reale` finche' branch, build, merge, deploy produzione e verifica autenticata della Inbox non sono tutti dimostrati.

## Obiettivo prodotto

La barra unica della Inbox deve comportarsi come un motore di ricerca web, non come un filtro SQL:

- parole esatte e testo presente in qualsiasi messaggio della conversazione;
- frasi esatte con virgolette (`"late check out"`);
- `OR` e negazione (`prenotazione -cancellazione`);
- refusi (`agiornati` -> `aggiornati`);
- parole incomplete/prefissi;
- sinonimi e intenzioni equivalenti quando la ricerca lessicale e' povera;
- ranking unico per pertinenza;
- frammento del messaggio che ha prodotto il match;
- isolamento tenant, canali assegnati e cartelle nascoste identici alla Inbox normale.

## Architettura

### 1. Web full-text search

La base rimane PostgreSQL FTS con configurazione `simple`, gia' applicata ai campi conversazione, contatto e contenuto di tutti i messaggi. `websearch_to_tsquery` fornisce sintassi web-search mantenendo virgolette, `OR` e `-term`.

### 2. Correzione fuzzy tenant-specifica

Il primo prototipo applicava `pg_trgm` al testo del `tsvector` di ogni conversazione. Era corretto ma troppo lento: sul database reale una ricerca con refuso e limite 50 impiegava circa **3,4 s**.

Il disegno finale usa `public.inbox_search_terms`, dizionario backend-only delle parole gia' presenti nel corpus del tenant. Un refuso/prefisso viene corretto contro circa 90k termini del tenant e trasformato in `tsquery`; la ricerca delle conversazioni torna poi a usare il GIN full-text esistente.

Misura indicativa sullo stesso caso reale: circa **0,46 s** lato database per 50 risultati fuzzy, oltre 7 volte piu' veloce del prototipo scartato.

Il dizionario non contiene corpi messaggio, solo lessici normalizzati; per il tenant di test occupa circa **33 MB**. Si aggiorna tramite trigger su nuovi messaggi, conversazioni e contatti.

### 3. Query understanding opzionale

Se i risultati deterministici sono pochi o deboli, il server puo' chiedere al modello gia' configurato in HotelAccelerator (`CHAT_MODEL` via Vercel AI Gateway) fino a 8 termini/frasi semanticamente equivalenti.

Regola privacy: **al modello viene inviata solo la query digitata dall'operatore, mai il contenuto della Inbox**.

Il passaggio AI:

- ha timeout breve;
- non parte per email, codici/numeri o sintassi avanzata intenzionale;
- non puo' cambiare la semantica di `"..."`, `OR` o `-term`;
- se fallisce per timeout, provider o rate limit, la ricerca deterministica gia' calcolata viene restituita normalmente.

### 4. Ranking

`search_inbox_google` fonde tre ranking con weighted Reciprocal Rank Fusion:

- match diretto: peso 1.60;
- fuzzy/corretto: peso 1.00;
- espansione semantica: peso 0.75.

I match esatti su email, nome e oggetto ricevono boost aggiuntivi.

### 5. Snippet

La funzione DB restituisce anche il `matched_message_id`. L'API recupera solo quel corpo per ogni risultato, lo converte in testo leggibile e genera un frammento centrato sul match.

Per compatibilita' con la UI Inbox esistente, durante la ricerca il frammento pertinente sostituisce il solo `last_message.preview` nella riga restituita; il messaggio reale non viene modificato nel database. L'API espone anche `search_match` con score, tipo match e intervalli di evidenziazione per un'evoluzione grafica successiva.

## Sicurezza / multi-tenant

- `search_inbox_google` e' `SECURITY INVOKER`.
- `property_id` e' predicate obbligatorio.
- accessi utente a email/messaging restano applicati prima del ranking.
- cartelle Gmail nascoste e filtri complessi restano applicati.
- `public.inbox_search_terms` ha RLS, grant client revocati e policy `authenticated` esplicitamente falsa.
- le funzioni che aggiornano/leggono il dizionario vivono nello schema `private` con `search_path=''`.
- la query utente non viene scritta nei log server; possono contenere solo lunghezza/presenza e metadati non sensibili.

## Verifiche su dati reali

- parola presente solo nel body: trovata dalla FTS esistente;
- refuso `agiornati`: corretto verso `aggiornati` e restituito come match fuzzy;
- frase `"villa i barronci"`: risultati con sintassi phrase search;
- `jacuzzi OR piscina`: risultati;
- `prenotazione -cancellazione`: 0 risultati contenenti il termine escluso nel campione verificato;
- test cross-tenant: 0 risultati con `property_id` diverso;
- test canale ristretto: 50 risultati, 0 fuori dal `channel_id` consentito;
- `anon` non puo' eseguire la RPC; `authenticated` puo';
- `anon` e `authenticated` non possono leggere direttamente `inbox_search_terms`.

## Migrazioni

- `20260906003704_inbox_google_hybrid_search_v2.sql` — tombstone del prototipo lento, mantenuto per allineare la history di produzione senza ricreare indici transitori indesiderati in ambienti nuovi.
- `20260906004044_inbox_google_term_dictionary_v2.sql` — implementazione finale fuzzy + ranking ibrido.
- `20260906004902_inbox_google_term_dictionary_explicit_deny.sql` — deny esplicito del vocabolario ai client autenticati.

## Rollback

Il percorso precedente `search_inbox_conversation_ids` resta disponibile e costituisce il fallback applicativo. Per rollback funzionale e' sufficiente rimuovere la chiamata a `search_inbox_google` dall'API.

Per rollback schema completo:

1. rimuovere trigger `inbox_capture_*_search_terms`;
2. rimuovere funzioni `private.capture_inbox_*_terms` e `private.inbox_fuzzy_tsquery`;
3. rimuovere `public.search_inbox_google`;
4. rimuovere `public.inbox_search_terms`.

Nessun messaggio, conversazione o contatto viene eliminato: il dizionario e' derivato.

## Limiti residui

- evidenziazione grafica del match nella lista non e' ancora consumata dalla pagina corrente; l'API fornisce gia' gli intervalli.
- la pagina Inbox attuale lega il caricamento direttamente allo stato del campo di ricerca; un debounce client dedicato resta un miglioramento UX/performance da chiudere prima di chiamare la feature `Production-ready`.
