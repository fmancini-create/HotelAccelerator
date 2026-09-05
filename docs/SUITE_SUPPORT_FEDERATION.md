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

## Risposte dalla Inbox 4BID

La risposta operatore deve attraversare il backend del prodotto sorgente prima di essere registrata come messaggio consegnato nella Inbox centrale. In questo modo HotelAccelerator non puo mostrare `delivered` quando il satellite non ha ancora accettato la risposta.

Per HotelProfitAI il callback `POST /api/integrations/support/v1/reply` usa Vercel OIDC come autenticazione primaria: il satellite accetta esclusivamente workload token del team 4BID, del progetto Vercel HotelAccelerator e dell'ambiente `production`. `CUSTOMER_CODE_REGISTRY_KEY_HPA` resta un fallback recovery e non e' piu un requisito per il percorso production ordinario.

Ogni azione operatore HotelAccelerator genera un `reply_id` UUID. HotelProfitAI usa lo stesso valore come idempotency key: un replay del callback non crea una seconda notifica o un secondo messaggio sorgente.

Per un utente autenticato del satellite, la risposta deve essere disponibile su due canali:

1. **in piattaforma**, attraverso una notifica privata indirizzata al `user_id` originale della segnalazione/conversazione;
2. **via email**, all'indirizzo del profilo corrente (con fallback allo snapshot email del feedback quando necessario).

La consegna email ha stato persistente e viene ritentata dal cron supporto gia esistente ogni cinque minuti. Un errore SMTP non cancella la risposta in piattaforma e non introduce un secondo cron concorrente.

Le notifiche private non usano `is_public`: la RLS del satellite consente la lettura solo al destinatario autenticato. I campi tecnici della consegna email non vengono esposti all'API notifiche del browser.

## Contatti esterni e qualificazione IA

Quando un interlocutore esterno chiede il passaggio a una persona o lascia una richiesta che deve diventare operativa, l'IA deve arrivare almeno a questi quattro dati prima di considerare completo il passaggio:

- nome;
- cognome;
- email;
- telefono.

La raccolta e progressiva e deterministica: il workflow conserva i campi gia ricevuti e chiede soltanto quelli mancanti. I dati gia noti dal canale o dal CRM (per esempio email di una conversazione email o numero WhatsApp) vengono riutilizzati e non richiesti di nuovo.

I campi raccolti restano in stato durevole nel workflow `conversation_staff_handoffs` e vengono copiati nella richiesta operativa verso lo staff/ManuBot. La conversazione conserva inoltre i metadata del passaggio, cosi un cambio pagina o un nuovo turno dell'LLM non azzera la qualificazione.

Questa raccolta e finalizzata al contatto operativo; non implica consenso marketing, che resta separato.

## Ownership

- La piattaforma satellite resta source of truth del thread e degli allegati locali.
- HotelAccelerator possiede la proiezione Inbox e la copia privata degli allegati centrali.
- Il producer satellite possiede il retry durevole delle proprie proiezioni immediate quando il Core non accetta o non raggiunge la richiesta.
- Il trigger database `trigger_update_conversation`, tramite `update_conversation_on_message()`, e l'unico proprietario dell'incremento di `conversations.unread_count` quando viene inserito un nuovo messaggio `customer`. La federazione deve preservare il contatore esistente (0 per una nuova conversazione) e non incrementarlo in anticipo.
- Una risposta inviata dalla Inbox 4BID viene prima salvata nel backend satellite attraverso `/api/integrations/support/v1/reply`; solo dopo viene materializzata nella Inbox centrale.
- Per HotelProfitAI, il cron `retry-support-feedback` resta l'unico proprietario sia del retry delle proiezioni feedback sia del retry email delle risposte supporto.
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

Le credenziali statiche rimangono disponibili come recovery:

- `CUSTOMER_CODE_REGISTRY_KEY_SNT`;
- `CUSTOMER_CODE_REGISTRY_KEY_HPA`;
- `CRON_SECRET`.

Il percorso production HotelAccelerator -> HotelProfitAI usa invece il `VERCEL_OIDC_TOKEN` fornito dal runtime Vercel e verificato dal satellite contro progetto/team/ambiente attesi.

I satelliti possono opzionalmente sovrascrivere l'endpoint Core con `SUPPORT_FEDERATION_URL`.

Non sono richiesti nuovi segreti per gli allegati: signed upload e signed download vengono emessi server-side usando i client storage gia configurati per ciascuna piattaforma.

## Osservabilita

Un payload respinto dal Core deve produrre un log strutturato con prodotto, status HTTP e soli path/codici degli errori di validazione, senza contenuti del messaggio, email, URL firmati o altri dati sensibili. Il producer registra l'esito della proiezione senza loggare segreti.

Gli errori database nella materializzazione vengono identificati per fase e codice PostgreSQL (per esempio `message_upsert_failed:23514`) senza includere il contenuto della riga o altri dati sensibili.

## Rollback

Le migrazioni sono additive. Il rollback applicativo consiste nel disabilitare/rimuovere upload, proiezione, retry e callback mantenendo intatti i thread locali e le colonne aggiunte. I bucket privati possono rimanere non pubblici senza compromettere le versioni precedenti.

Non eliminare automaticamente oggetti gia allegati durante un rollback: la cancellazione dei file e un'azione dati separata e potenzialmente distruttiva.

## Stato ufficiale

**Codice**: la federazione base ha gia superato il collaudo testuale reale HotelProfitAI -> Inbox 4BID. L'estensione di risposta bidirezionale, notifica privata/email e qualificazione completa dei contatti esterni e implementata a livello codice ma non va promossa oltre finche' una risposta reale da produzione non risulta contemporaneamente visibile in HotelProfitAI e consegnata per email al destinatario. La feature completa con allegati resta subordinata anche al collaudo end-to-end di un allegato reale.
