# Suite support federation

## Obiettivo

Le piattaforme della suite 4BID mantengono la propria identita, il proprio backend e la propria fonte di verita per le conversazioni di supporto. HotelAccelerator aggrega nella Inbox del tenant 4BID una proiezione operativa dei soli thread di supporto piattaforma che devono poter essere gestiti centralmente.

## Contratto v1

Endpoint Core: `POST /api/integrations/support/v1/project`.

Autenticazione server-to-server tramite Vercel OIDC, con fallback alle credenziali recovery per prodotto gia usate dal customer-code registry. Le credenziali non sono esposte al browser.

Ogni snapshot contiene prodotto, tenant esterno, thread, tipo di supporto, stato, pagina di origine e messaggi. Per le richieste `miglioria` e `errore` il contratto porta inoltre lo snapshot dell'autore (`user_id`, nome, email) e gli eventuali allegati. HotelAccelerator risolve il tenant tramite customer-code registry e materializza il thread nella Inbox del tenant centrale `4bid`.

I timestamp dei messaggi seguono RFC3339 e il Core accetta sia la forma UTC con `Z` sia gli offset espliciti come `+00:00`, che e' il formato normalmente serializzato da Supabase/PostgREST per i campi `timestamptz`. I producer possono normalizzare in UTC `Z` per mantenere compatibilita durante rollout coordinati.

Gli ID di conversazioni e messaggi materializzati sono deterministici: retry, replay e recovery sync non devono creare duplicati.

I valori del contratto esterno vengono adattati al modello Inbox reale: `customer | agent | system` restano gli stessi `sender_type`; lo stato esterno `closed` viene materializzato come `resolved`, perche' `conversations.status` non espone `closed`.

## Tracciamento autore e pagina

Per ogni segnalazione di errore o miglioria devono restare associati:

- ID dell'utente autenticato che ha effettuato l'invio;
- nome e email congelati al momento dell'invio, cosi lo storico non cambia se il profilo viene successivamente rinominato o disattivato;
- tenant/struttura di appartenenza;
- percorso reale della pagina dalla quale e stata aperta la segnalazione.

L'identita non viene accettata come dato fiduciario dal browser: viene risolta server-side dalla sessione autenticata. Il percorso arriva dal client per precisione contestuale; se manca per un client in cache, gli endpoint di feedback usano il `Referer` come fallback e infine un valore esplicito di pagina non disponibile.

HotelAccelerator conserva questi dati sia nei metadata della conversazione Inbox sia nei metadata del messaggio. Santaddeo e HotelProfitAI conservano inoltre lo snapshot dell'autore e la pagina nella propria source of truth locale.

## Allegati privati

Le segnalazioni `miglioria` e `errore` possono includere screenshot, immagini, PDF, file di testo/CSV/JSON e documenti Office autorizzati.

Vincoli applicativi:

- massimo 5 file per segnalazione;
- massimo 10 MB per file;
- massimo 25 MB complessivi per segnalazione;
- MIME type controllati sia nel client sia nel server;
- nessun bucket pubblico e nessun URL permanente memorizzato nel thread.

Ogni prodotto usa il bucket privato `support-private`. Il browser riceve un signed upload token dal proprio backend e carica direttamente sullo storage privato; il path e sempre scoped a tenant e utente. Il backend verifica nuovamente che tutti i riferimenti appartengano al tenant/utente autenticato prima di salvare la segnalazione.

Quando un satellite proietta il feedback in HotelAccelerator, genera URL sorgente firmati e temporanei. HotelAccelerator scarica i file server-to-server e ne conserva una propria copia privata nella proiezione centrale. In questo modo la Inbox non dipende dalla scadenza dell'URL firmato del satellite e il satellite continua a possedere la copia locale.

Per il download, sia i backend locali sia HotelAccelerator verificano prima autorizzazione e appartenenza del record, poi emettono un URL firmato di breve durata. La Inbox 4BID mostra i link agli allegati direttamente nel messaggio insieme a `Segnalato da` e `Pagina`.

## Ownership

- La piattaforma satellite resta source of truth del thread e degli allegati locali.
- HotelAccelerator possiede la proiezione Inbox e la copia privata degli allegati centrali.
- Il producer satellite possiede il retry durevole delle proprie proiezioni immediate quando il Core non accetta o non raggiunge la richiesta.
- Il trigger database `trigger_update_conversation`, tramite `update_conversation_on_message()`, e l'unico proprietario dell'incremento di `conversations.unread_count` quando viene inserito un nuovo messaggio `customer`. La federazione deve preservare il contatore esistente (0 per una nuova conversazione) e non incrementarlo in anticipo.
- Una risposta inviata dalla Inbox 4BID viene prima salvata nel backend satellite attraverso `/api/integrations/support/v1/reply`; solo dopo viene materializzata nella Inbox centrale.
- Nessun database satellite viene letto o scritto direttamente da HotelAccelerator.

## Perimetro

Inclusi:

- supporto umano nativo Santaddeo;
- feedback `miglioria` e `errore` Santaddeo;
- supporto umano HotelProfitAI quando il piano espone `priority_support`;
- feedback `miglioria` e `errore` HotelProfitAI;
- segnalazioni `miglioria` e `errore` originate direttamente da HotelAccelerator.

Esclusi intenzionalmente:

- chat AI ordinarie dei prodotti;
- escalation Santaddeo verso partner/RevMentor;
- consulenze HotelProfitAI inoltrate al commercialista;
- conversazioni che appartengono a provider o professionisti terzi.

## HotelAccelerator: guida interna

L'area tenant espone una guida contestuale interna che usa esclusivamente knowledge base HotelAccelerator sincronizzate e pronte. Se il contesto non e sufficiente, la guida non deve inventare funzionalita.

La stessa interfaccia espone `Segnala miglioria` e `Segnala errore`. Le segnalazioni creano vere conversazioni nella Inbox 4BID con tenant, autore, pagina e allegati associati.

## Recovery e retry

HotelAccelerator esegue il recovery sync del supporto umano nativo Santaddeo ogni 5 minuti. Il satellite resta comunque proprietario del thread e il sync e idempotente.

Le proiezioni immediate dai satelliti sono best-effort rispetto alla scrittura locale: un errore del Core non deve annullare la segnalazione gia salvata nel prodotto sorgente. Questo non significa pero' perdere l'evento. I producer devono conservare uno stato durevole di consegna o un outbox equivalente e ritentare in modo idempotente gli elementi non materializzati.

HotelProfitAI conserva per `ai_feedback` il timestamp della proiezione riuscita, l'ultimo tentativo e il numero dei tentativi. Un cron proprietario del satellite riprova gli elementi pendenti; il Core continua a deduplicare conversazione, messaggio e copia allegati tramite ID/path deterministici.

Gli allegati centrali usano path deterministici nella fase di copia, quindi un retry non genera copie parallele dello stesso file.

## Configurazione

Riutilizza le integrazioni server-to-server esistenti:

- `CUSTOMER_CODE_REGISTRY_KEY_SNT`
- `CUSTOMER_CODE_REGISTRY_KEY_HPA`
- `CRON_SECRET`
- URL prodotto gia definiti nel catalogo SSO della suite.

I satelliti possono opzionalmente sovrascrivere l'endpoint Core con `SUPPORT_FEDERATION_URL`.

Non sono richiesti nuovi segreti per gli allegati: signed upload e signed download vengono emessi server-side usando i client storage gia configurati per ciascuna piattaforma.

## Osservabilita

Un payload respinto dal Core deve produrre un log strutturato con prodotto, status HTTP e soli path/codici degli errori di validazione, senza contenuti del messaggio, email, URL firmati o altri dati sensibili. Il producer registra l'esito della proiezione senza loggare segreti.

Gli errori database nella materializzazione vengono identificati per fase e codice PostgreSQL (per esempio `message_upsert_failed:23514`) senza includere il contenuto della riga o altri dati sensibili.

## Rollback

Le migrazioni sono additive. Il rollback applicativo consiste nel disabilitare/rimuovere upload, proiezione, retry e callback mantenendo intatti i thread locali e le colonne aggiunte. I bucket privati possono rimanere non pubblici senza compromettere le versioni precedenti.

Non eliminare automaticamente oggetti gia allegati durante un rollback: la cancellazione dei file e un'azione dati separata e potenzialmente distruttiva.

## Stato ufficiale

**Codice**: l'estensione aggiunge autore, pagina reale e allegati privati alle segnalazioni di errore/miglioria di HotelAccelerator, Santaddeo e HotelProfitAI. Il collaudo reale del 5 settembre 2026 su un feedback HotelProfitAI ha fatto emergere e correggere tre divergenze del contratto/materializzazione: timestamp RFC3339 con offset, mapping `sender_type`/stato verso i valori reali della Inbox e doppio incremento di `unread_count` rispetto al trigger DB. Il retry durevole HotelProfitAI ha recuperato la segnalazione senza duplicare conversazione o messaggio. La promozione a `Tenant reale` della feature completa richiede ancora un collaudo end-to-end autenticato con almeno una segnalazione reale e un allegato verificato sia nel backend locale sia nella Inbox 4BID.
